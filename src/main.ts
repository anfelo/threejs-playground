import { EasingFunctionsScene } from "./easing-functions";
import { LightingModelScene } from "./lighting-model";
import { Scene } from "./types";
import { WarpedSphereScene } from "./warped-sphere";

let currentItem: string | null = "";
const initialItem = "easing-functions";
let currentScene: Scene | null;

const items = [
    {
        title: "Lighting Model",
        slug: "lighting-model",
        onClick: async () => {
            currentScene = new LightingModelScene();
            currentScene.init();
        }
    },
    {
        title: "Easing Functions",
        slug: "easing-functions",
        onClick: async () => {
            currentScene = new EasingFunctionsScene();
            currentScene.init();
        }
    },
    {
        title: "Warped Sphere",
        slug: "warped-sphere",
        onClick: async () => {
            currentScene = new WarpedSphereScene();
            currentScene.init();
        }
    }
];

document.querySelector("#playground-menu nav")!.innerHTML = `
    <ul>
        ${items.map(item => `<li><a href="#" class="menu-item" data-slug="${item.slug}">${item.title}</a></li>`).join("")}
    </ul>
`;

document.querySelectorAll(".menu-item").forEach(menuItem => {
    menuItem.addEventListener("click", () => {
        const slug = (menuItem as HTMLElement).dataset.slug;
        selectMenuItem(slug || null);
    });
});

function selectMenuItem(itemSlug: string | null) {
    if (currentItem === itemSlug) {
        return;
    }

    if (!itemSlug) {
        return;
    }

    if (currentScene) {
        currentScene.destroy();
        currentScene = null;
    }

    const item = items.find(i => i.slug === itemSlug);

    if (item) {
        currentItem = itemSlug;

        item.onClick();
    }
}

selectMenuItem(initialItem);
