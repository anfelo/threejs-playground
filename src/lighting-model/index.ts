import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Scene } from "../types";

const vertexShader = `
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
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

export class LightingModelScene implements Scene {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    uniforms: { [uniform: string]: THREE.IUniform<any> } = {};

    sidebarWidth = 250;
    playgroundContent = document.querySelector("#playground-content") as HTMLElement;
    renderer = new THREE.WebGLRenderer();

    gui = new dat.GUI();
    uiState = {
        enableAxesHelper: false,
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
        fresnelIntensity: 2.0,
    };

    axesHelper: THREE.AxesHelper | null = null;

    constructor() {}

    destroy() {
        this.gui?.destroy();
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
            },
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

        const f1 = this.gui.addFolder("Ambient");
        f1.add(this.uiState, "ambientFactor").min(0.0).max(1.0).step(0.01);
        f1.addColor(this.uiState, "ambientColor").onChange(newColor => {
            this.uiState.ambientColorUnit = newColor.map((value: number) => value / 255);
        });

        const f2 = this.gui.addFolder("Hemi");
        f2.add(this.uiState, "hemiFactor").min(0.0).max(1.0).step(0.01);
        f2.addColor(this.uiState, "hemiSkyColor").onChange(newColor => {
            this.uiState.hemiSkyColorUnit = newColor.map((value: number) => value / 255);
        });
        f2.addColor(this.uiState, "hemiGroundColor").onChange(newColor => {
            this.uiState.hemiGroundColorUnit = newColor.map((value: number) => value / 255);
        });

        const f3 = this.gui.addFolder("Diffuse");
        f3.add(this.uiState, "diffuseFactor").min(0.0).max(1.0).step(0.01);
        f3.addColor(this.uiState, "diffuseColor").onChange(newColor => {
            this.uiState.diffuseColorUnit = newColor.map((value: number) => value / 255);
        });

        const f4 = this.gui.addFolder("Phong Specular");
        f4.add(this.uiState, "phongFactor").min(0.0).max(1.0).step(0.01);
        f4.add(this.uiState, "phongShininess").min(0.0).max(50).step(0.01);

        const f5 = this.gui.addFolder("IBL Specular");
        f5.add(this.uiState, "iblFactor").min(0.0).max(1.0).step(0.01);

        const f6 = this.gui.addFolder("Fresnel Specular");
        f6.add(this.uiState, "fresnelFactor").min(0.0).max(1.0).step(0.01);
        f6.add(this.uiState, "fresnelIntensity").min(0.0).max(5.0).step(0.01);
    }
}
