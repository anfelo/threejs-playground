import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Scene } from "../types";

const vertexShader = `
varying vec3 vNormal;
varying vec3 vPosition;

uniform float time;
uniform int easingId;

float inverseLerp(float v, float minValue, float maxValue) {
    return (v - minValue) / (maxValue - minValue);
}

float remap(float v, float inMin, float inMax, float outMin, float outMax) {
    float t = inverseLerp(v, inMin, inMax);
    return mix(outMin, outMax, t);
}

float easeOutBounce(float x) {
    const float n1 = 7.5625;
    const float d1 = 2.75;

    if (x < 1.0 / d1) {
        return n1 * x * x;
    } else if (x < 2.0 / d1) {
        x -= 1.5 / d1;
        return n1 * x * x + 0.75;
    } else if (x < 2.5 / d1) {
        x -= 2.25 / d1;
        return n1 * x * x + 0.9375;
    } else {
        x -= 2.625 / d1;
        return n1 * x * x + 0.984375;
    }
}

float easeInBounce(float x) {
    return 1.0 - easeOutBounce(1.0 - x);
}

float easeInOutBounce(float x) {
    return x < 0.5
        ? (1.0 - easeOutBounce(1.0 - 2.0 * x)) / 2.0
        : (1.0 + easeOutBounce(2.0 * x - 1.0)) / 2.0;
}

void main() {
    vec3 localSpacePosition = position;

    float easing = 1.0;
    switch (easingId) {
        case 0:
            easing = easeInBounce(clamp(time - 1.0, 0.0, 1.0));
            break;
        case 1:
            easing = easeOutBounce(clamp(time - 1.0, 0.0, 1.0));
            break;
        case 2:
            easing = easeInOutBounce(clamp(time - 1.0, 0.0, 1.0));
            break;
    }
    localSpacePosition *= easing;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(localSpacePosition, 1.0);
    vNormal = (modelMatrix * vec4(normal, 0.0)).xyz;
    vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
}
`;

const fragmentShader = `
uniform samplerCube specMap;

uniform vec3 ambientColor;
uniform float ambientFactor;

uniform vec3 hemiSkyColor;
uniform vec3 hemiGroundColor;
uniform float hemiFactor;

uniform vec3 diffuseColor;
uniform float diffuseFactor;

uniform float phongShininess;
uniform float phongFactor;

uniform float iblFactor;

uniform float fresnelFactor;
uniform float fresnelIntensity;

varying vec3 vNormal;
varying vec3 vPosition;

float inverseLerp(float v, float minValue, float maxValue) {
    return (v - minValue) / (maxValue - minValue);
}

float remap(float v, float inMin, float inMax, float outMin, float outMax) {
    float t = inverseLerp(v, inMin, inMax);
    return mix(outMin, outMax, t);
}


float toSRGB(float value) {
    if (value < 0.0031308) {
        return value * 12.92;
    }
    return pow(value, 0.41666) * 1.055 - 0.055;
}

vec3 linearToSRGB(vec3 value) {
    return vec3(toSRGB(value.x), toSRGB(value.y), toSRGB(value.z));
}

void main() {
    vec3 baseColor = vec3(0.5);
    vec3 lighting = vec3(0.0);
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(cameraPosition - vPosition);

    // Ambient
    vec3 ambient = ambientColor;

    // Hemi light
    vec3 skyColor = hemiSkyColor;
    vec3 groundColor = hemiGroundColor;

    float hemiMix = remap(normal.y, -1.0, 1.0, 0.0, 1.0);
    vec3 hemi = mix(skyColor, groundColor, hemiMix);

    // Diffuse light
    vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
    vec3 lightColor = diffuseColor;
    float dp = max(0.0, dot(lightDir, normal));

    vec3 diffuse = dp * lightColor;

    // Phong specular
    vec3 r = normalize(reflect(-lightDir, normal));
    float phongValue = max(0.0, dot(viewDir, r));
    phongValue = pow(phongValue, phongShininess);

    vec3 specular = vec3(phongValue) * phongFactor;

    // IBL specular
    vec3 iblCoord = normalize(reflect(-viewDir, normal));
    vec3 iblSample = textureCube(specMap, iblCoord).xyz;

    specular += iblSample * iblFactor;

    // Fresnel effect
    float fresnel = 1.0 - max(0.0, dot(viewDir, normal));
    fresnel = pow(fresnel, fresnelIntensity);

    specular *= fresnel * fresnelFactor;

    lighting = ambient * ambientFactor + hemi * hemiFactor + diffuse * diffuseFactor;

    vec3 color = baseColor * lighting + specular;

    // color = linearToSRGB(color);
    color = pow(color, vec3(1.0 / 2.2));

    gl_FragColor = vec4(color, 1.0);
}
`;

export class EasingFunctionsScene implements Scene {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    uniforms: { [uniform: string]: THREE.IUniform<any> } = {};

    sidebarWidth = 250;
    playgroundContent = document.querySelector("#playground-content") as HTMLElement;
    renderer = new THREE.WebGLRenderer();

    gui = new dat.GUI();
    uiState = {
        enableAxesHelper: false,
        easingFunction: "easeInBounce",
        // Ambient
        ambientFactor: 0.0,
        ambientColor: [128, 128, 128],
        ambientColorUnit: [0.5, 0.5, 0.5],
        // Hemi
        hemiFactor: 0.5,
        hemiSkyColor: [0, 77, 153],
        hemiSkyColorUnit: [0.0, 0.3, 0.6],
        hemiGroundColor: [153, 77, 26],
        hemiGroundColorUnit: [0.6, 0.3, 0.1],
        // Diffuse
        diffuseFactor: 0.5,
        diffuseColor: [255, 255, 230],
        diffuseColorUnit: [1.0, 1.0, 0.9],
        // Phong Specular
        phongFactor: 1.0,
        phongShininess: 32,
        // IBL Specular
        iblFactor: 1.0,
        // Fresnel Specular
        fresnelFactor: 1.0,
        fresnelIntensity: 2.0
    };

    easingFunctions = ["easeInBounce", "easeOutBounce", "easeInOutBounce"];

    axesHelper: THREE.AxesHelper | null = null;

    totalTime: number = 0.0;
    clock = new THREE.Clock();

    constructor() {}

    destroy() {
        this.gui?.destroy();
        this.renderer.setAnimationLoop(null);

        // Dispose objects
        this.scene.traverse((object: any) => {
            if (object.geometry) object.geometry.dispose();
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach((mat: any) => mat.dispose());
                } else {
                    object.material.dispose();
                }
            }
        });
        this.scene.clear();

        // Dispose renderer
        this.renderer.dispose();
        this.renderer.forceContextLoss();
        this.renderer.domElement.remove();

        // Remove event listeners
        window.removeEventListener("resize", this.onWindowResize);
    }

    async init(): Promise<void> {
        this.renderer.setSize(window.innerWidth - this.sidebarWidth, window.innerHeight);
        this.playgroundContent.appendChild(this.renderer.domElement);

        window.addEventListener("resize", () => this.onWindowResize(), false);

        this.initDebugUI();

        const controls = new OrbitControls(this.camera, this.renderer.domElement);
        controls.target.set(0, 0, 0);
        controls.update();

        const loader = new THREE.CubeTextureLoader();
        const texture = loader.load([
            "/img/Cold_Sunset__Cam_2_Left+X.png",
            "/img/Cold_Sunset__Cam_3_Right-X.png",
            "/img/Cold_Sunset__Cam_4_Up+Y.png",
            "/img/Cold_Sunset__Cam_5_Down-Y.png",
            "/img/Cold_Sunset__Cam_0_Front+Z.png",
            "/img/Cold_Sunset__Cam_1_Back-Z.png"
        ]);

        this.scene.background = texture;

        await this.setupProject();

        if (this.uiState.enableAxesHelper) {
            this.axesHelper = new THREE.AxesHelper(5);
            this.scene.add(this.axesHelper);
        }

        this.camera.position.z = 5;

        this.onWindowResize();
        this.renderer.setAnimationLoop((time, frame) => this.animate(time, frame));
    }

    async setupProject(): Promise<void> {
        this.uniforms = {
            time: {
                value: 0.0
            },
            easingId: {
                value: 0
            },
            specMap: {
                value: this.scene.background
            },
            ambientColor: {
                value: this.uiState.ambientColorUnit
            },
            ambientFactor: {
                value: this.uiState.ambientFactor
            },
            hemiFactor: {
                value: this.uiState.hemiFactor
            },
            hemiSkyColor: {
                value: this.uiState.hemiSkyColorUnit
            },
            hemiGroundColor: {
                value: this.uiState.hemiGroundColorUnit
            },
            diffuseColor: {
                value: this.uiState.diffuseColorUnit
            },
            diffuseFactor: {
                value: this.uiState.diffuseFactor
            },
            phongFactor: {
                value: this.uiState.phongFactor
            },
            phongShininess: {
                value: this.uiState.phongShininess
            },
            iblFactor: {
                value: this.uiState.iblFactor
            },
            fresnelFactor: {
                value: this.uiState.fresnelFactor
            },
            fresnelIntensity: {
                value: this.uiState.fresnelIntensity
            }
        };
        const material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: vertexShader,
            fragmentShader: fragmentShader
        });

        const loader = new GLTFLoader();
        loader.setPath("/models/");
        loader.load("suzanne.glb", gltf => {
            gltf.scene.traverse(c => {
                (c as THREE.Mesh).material = material;
            });
            this.scene.add(gltf.scene);
        });

        this.onWindowResize();
    }

    private animate(_time: DOMHighResTimeStamp, _frame: XRFrame): void {
        const elapsedTime = this.clock.getElapsedTime();
        this.uniforms.time.value = elapsedTime;

        const easingId = this.easingFunctions.indexOf(this.uiState.easingFunction);
        this.uniforms.easingId.value = easingId;

        this.uniforms.ambientColor.value = this.uiState.ambientColorUnit;
        this.uniforms.ambientFactor.value = this.uiState.ambientFactor;

        this.uniforms.hemiFactor.value = this.uiState.hemiFactor;
        this.uniforms.hemiSkyColor.value = this.uiState.hemiSkyColorUnit;
        this.uniforms.hemiGroundColor.value = this.uiState.hemiGroundColorUnit;

        this.uniforms.diffuseColor.value = this.uiState.diffuseColorUnit;
        this.uniforms.diffuseFactor.value = this.uiState.diffuseFactor;

        this.uniforms.phongFactor.value = this.uiState.phongFactor;
        this.uniforms.phongShininess.value = this.uiState.phongShininess;

        this.uniforms.iblFactor.value = this.uiState.iblFactor;

        this.uniforms.fresnelFactor.value = this.uiState.fresnelFactor;
        this.uniforms.fresnelIntensity.value = this.uiState.fresnelIntensity;

        this.renderer.render(this.scene, this.camera);
    }

    private onWindowResize() {
        this.renderer.setSize(window.innerWidth - this.sidebarWidth, window.innerHeight);

        this.camera.aspect = (window.innerWidth - this.sidebarWidth) / window.innerHeight;
        this.camera.updateProjectionMatrix();
    }

    private initDebugUI() {
        this.gui.remember(this.uiState);

        this.gui.add(this.uiState, "enableAxesHelper").onChange(() => {
            if (this.axesHelper) {
                this.scene.remove(this.axesHelper);
                this.axesHelper = null;
            }

            if (this.uiState.enableAxesHelper) {
                this.axesHelper = new THREE.AxesHelper(5);
                this.scene.add(this.axesHelper);
            }
        });

        const f1 = this.gui.addFolder("Easing Functions");
        f1.add(this.uiState, "easingFunction", this.easingFunctions).onChange(() => {
            this.clock = new THREE.Clock();
        });
    }
}
