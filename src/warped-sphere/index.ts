import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Scene } from "../types";

const vertexShader = `
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vColor;

uniform float time;

float inverseLerp(float v, float minValue, float maxValue) {
    return (v - minValue) / (maxValue - minValue);
}

float remap(float v, float inMin, float inMax, float outMin, float outMax) {
    float t = inverseLerp(v, inMin, inMax);
    return mix(outMin, outMax, t);
}

void main() {
    vec3 localSpacePosition = position;

    float t = sin(localSpacePosition.y * 20.0 + time * 10.0);
    t = remap(t, -1.0, 1.0, 0.0, 0.2);
    localSpacePosition += normal * t;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(localSpacePosition, 1.0);
    vNormal = (modelMatrix * vec4(normal, 0.0)).xyz;
    vPosition = (modelMatrix * vec4(localSpacePosition, 1.0)).xyz;
    vColor = mix(vec3(0.0, 0.0, 0.5), vec3(0.1, 0.5, 0.8), smoothstep(0.0, 0.2, t));
}
`;

const fragmentShader = `
uniform samplerCube specMap;

varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vColor;

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
    vec3 baseColor = vColor.xyz;
    vec3 lighting = vec3(0.0);

    // vec3 normal = normalize(vNormal);
    vec3 normal = normalize(cross(dFdx(vPosition.xyz), dFdy(vPosition.xyz)));
    vec3 viewDir = normalize(cameraPosition - vPosition);

    // Ambient
    vec3 ambient = vec3(1.0);

    // Hemi light
    vec3 skyColor = vec3(0.0, 0.3, 0.6);
    vec3 groundColor = vec3(0.6, 0.3, 0.1);

    float hemiMix = remap(normal.y, -1.0, 1.0, 0.0, 1.0);
    vec3 hemi = mix(skyColor, groundColor, hemiMix);

    // Diffuse light
    vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
    vec3 lightColor = vec3(1.0, 1.0, 0.9);
    float dp = max(0.0, dot(lightDir, normal));

    vec3 diffuse = dp * lightColor;
    vec3 specular = vec3(0.0);

    // Specular
    vec3 r = normalize(reflect(-lightDir, normal));
    float phongValue = max(0.0, dot(viewDir, r));
    phongValue = pow(phongValue, 32.0);

    specular += phongValue * 0.15;

    // IBL Specular
    vec3 iblCoord = normalize(reflect(-viewDir, normal));
    vec3 iblSample = textureCube(specMap, iblCoord).xyz;

    specular += iblSample * 0.5;

    // Fresnel
    float fresnel = 1.0 - max(0.0, dot(viewDir, normal));
    fresnel = pow(fresnel, 2.0);

    specular *= fresnel;

    // Combine lighting
    lighting = hemi * 0.1 + diffuse;

    vec3 colour = baseColor * lighting + specular;

    gl_FragColor = vec4(pow(colour, vec3(1.0 / 2.2)), 1.0);
}
`;

export class WarpedSphereScene implements Scene {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    uniforms: { [uniform: string]: THREE.IUniform<any> } = {};

    sidebarWidth = 250;
    playgroundContent = document.querySelector("#playground-content") as HTMLElement;
    renderer = new THREE.WebGLRenderer();

    gui = new dat.GUI();
    uiState = {
        enableAxesHelper: false
    };

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
            specMap: {
                value: this.scene.background
            },
            time: {
                value: 0.0
            }
        };
        const material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: vertexShader,
            fragmentShader: fragmentShader
        });

        const geometry = new THREE.IcosahedronGeometry(1, 128);
        const mesh = new THREE.Mesh(geometry, material);
        this.scene.add(mesh);

        this.onWindowResize();
    }

    private animate(_time: DOMHighResTimeStamp, _frame: XRFrame): void {
        const elapsedTime = this.clock.getElapsedTime();
        this.uniforms.time.value = elapsedTime;

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
    }
}
