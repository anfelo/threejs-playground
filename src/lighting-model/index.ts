import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Scene } from "../types";

export class LightingModelScene implements Scene {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    sidebarWidth = 250;
    playgroundContent = document.querySelector("#playground-content") as HTMLElement;
    renderer = new THREE.WebGLRenderer();

    gui = new dat.GUI();
    uiState = {
        enableAxesHelper: false
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
        const vsh = await fetch("./shaders/vertex-shader.glsl");
        const fsh = await fetch("./shaders/fragment-shader.glsl");

        const material = new THREE.ShaderMaterial({
            uniforms: {},
            vertexShader: await vsh.text(),
            fragmentShader: await fsh.text()
        });

        const loader = new GLTFLoader();
        loader.setPath("/models/");
        loader.load("suzanne.glb", gltf => {
            gltf.scene.traverse(c => {
                c.material = material;
            });
            this.scene.add(gltf.scene);
        });

        this.onWindowResize();
    }

    private animate(_time: DOMHighResTimeStamp, _frame: XRFrame): void {
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
