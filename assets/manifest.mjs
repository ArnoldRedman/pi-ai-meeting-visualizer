// 只列当前场景使用的文件，下载器和 HTTP 白名单共用此清单
export const characterModels = ['character-female-a', 'character-male-a', 'character-female-b', 'character-male-b'];
// 本地自制角色：不下载，直接读 assets/models/characters 下的同名 GLB，键与文件名一致
export const customCharacterModels = [
  'character-claude', 'character-deepseek', 'character-gemini', 'character-glm',
  'character-gpt', 'character-grok', 'character-kimi', 'character-qwen',
];
export const furnitureModels = [
  'table', 'chairDesk', 'pottedPlant', 'bookcaseOpen', 'books', 'laptop',
  'televisionModern', 'wallWindow', 'floorFull', 'loungeSofa',
  'kitchenCoffeeMachine', 'sideTable', 'lampRoundFloor',
];

export const assetPacks = [
  {
    id: 'mini-characters', folder: 'characters', title: 'Mini Characters',
    page: 'https://kenney.nl/assets/mini-characters',
    url: 'https://kenney.nl/media/pages/assets/mini-characters/bfc7e272b4-1774770718/kenney_mini-characters.zip',
    sha256: '9e1d48e6d7b8479ebbe84df71eb5bd8e1b3f0da546dea641890dccc8a02d0999',
    files: Object.fromEntries([
      ...characterModels.map(name => [`${name}.glb`, `Models/GLB format/${name}.glb`]),
      ['Textures/colormap.png', 'Models/GLB format/Textures/colormap.png'],
      ['License.txt', 'License.txt'],
    ]),
  },
  {
    id: 'furniture-kit', folder: 'furniture', title: 'Furniture Kit',
    page: 'https://kenney.nl/assets/furniture-kit',
    url: 'https://kenney.nl/media/pages/assets/furniture-kit/440e0608a4-1677580847/kenney_furniture-kit.zip',
    sha256: 'e67652d0932cee41683f74711c03d3e192a2af9979ef8e6b237711f5482d46b0',
    files: Object.fromEntries([
      ...furnitureModels.map(name => [`${name}.glb`, `Models/GLTF format/${name}.glb`]),
      ['License.txt', 'License.txt'],
    ]),
  },
];

export const modelUrl = (folder, name) => `/assets/kenney/${folder}/${name}.glb`;
export const customModelUrl = name => `/assets/models/characters/${name}.glb`;
