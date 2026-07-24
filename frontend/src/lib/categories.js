import { normalizeText } from './matcher'

export const CATEGORY_DEFS = [
  {
    id: 'lacteos',
    label: 'Lácteos y huevos',
    keywords: ['leche', 'queso', 'yogur', 'yogurt', 'kumis', 'mantequilla', 'crema de leche', 'arequipe', 'margarina', 'huevo', 'bonyurt'],
  },
  {
    id: 'carnes',
    label: 'Carnes y aves',
    keywords: ['pollo', ' res ', 'carne de res', 'cerdo', 'carne', 'chorizo', 'tocineta', 'jamon', 'costilla', 'pechuga', 'muslo', 'pescado', 'camaron', 'atun', 'salchicha', 'higado', 'morcilla', 'pavo', 'cordero', 'mortadela', 'salchichon', 'chuleta', 'alitas', 'alas de pollo'],
  },
  {
    id: 'frutas_verduras',
    label: 'Frutas y verduras',
    keywords: ['aguacate', 'acelga', 'cebolla', 'tomate', 'lechuga', 'zanahoria', 'papa', 'banano', 'mango', 'pina', 'limon', 'cilantro', 'platano', 'fruta', 'verdura', 'espinaca', 'pepino', 'pimenton', 'apio', 'brocoli', 'coliflor', 'remolacha', 'habichuela', 'arveja', 'uva', 'manzana', 'naranja', 'fresa', 'melon', 'sandia', 'mora', 'maracuya', 'curuba', 'ajo', 'cebollin', 'perejil', 'yuca', 'ahuyama', 'alcachofa', 'berenjena', 'esparrago', 'champinon', 'arandano', 'ciruela', 'durazno', 'almendra', 'nuez', 'pasa', 'coco', 'arracacha', 'granadilla', 'papaya', 'kiwi', 'lulo', 'guayaba', 'albahaca'],
  },
  {
    id: 'granos',
    label: 'Granos y abarrotes',
    keywords: ['arroz', 'frijol', 'lenteja', 'garbanzo', 'aceite', 'ajonjoli', 'achiote', ' sal ', 'sal marina', 'azucar', 'harina', 'avena', 'pasta', 'maiz', 'cereal', 'condimento', 'especia', 'vinagre', 'sazon', 'color industrial', 'comino', 'pimienta', 'laurel', 'canela', 'panela', 'curry', 'curcuma', 'clavo', 'oregano', 'tomillo', 'romero', 'cebada', 'cuchuco', 'maizena', 'levadura', 'bicarbonato', 'vainilla', 'esencia', 'salsa', 'mostaza', 'mayonesa', 'ketchup', 'miel', 'gelatina', 'bechamel', 'chimichurri', 'chimichurry', 'alcaparra', 'grano'],
  },
  {
    id: 'bebidas',
    label: 'Bebidas',
    keywords: ['agua', 'gaseosa', 'jugo', 'cerveza', 'aguardiente', 'cafe', ' te ', 'malta', 'bebida', 'whisky', ' ron ', 'vino', 'vodka', 'licor', 'soda', 'energizante', 'gatorade', 'coca cola', 'cola y pola', 'ginger beer', 'ginebra', 'limonada', 'refresco', 'pola'],
  },
  {
    id: 'panaderia',
    label: 'Panadería y postres',
    keywords: ['pan ', 'galleta', 'arepa', 'croissant', 'crossant', 'ponque', 'tostada', 'torta', 'bizcocho', 'hojaldre', 'dona', 'crookie', 'cheesecake', 'chocoflan', 'compota', 'flan', 'pudin'],
  },
  {
    id: 'limpieza',
    label: 'Limpieza y aseo',
    keywords: ['detergente', 'jabon', 'desinfectante', 'guante', 'esponj', 'blanqueador', 'limpiavidrios', 'limpiador', 'cloro', 'escoba', 'trapero', 'bolsa de basura', 'alcohol'],
  },
  {
    id: 'desechables',
    label: 'Desechables',
    keywords: ['vaso', 'plato desechable', 'servilleta', 'papel aluminio', 'icopor', 'pitillo', 'desechable', 'papel higienico', 'rollo de papel'],
  },
  {
    id: 'general',
    label: 'Otros',
    keywords: [],
  },
]

const CATEGORY_BY_ID = Object.fromEntries(CATEGORY_DEFS.map((cat) => [cat.id, cat]))

export function categoryLabel(id) {
  return CATEGORY_BY_ID[id]?.label || 'Otros'
}

export function categorize(name) {
  const normalized = ` ${normalizeText(name)} `
  for (const cat of CATEGORY_DEFS) {
    if (cat.id === 'general') continue
    if (cat.keywords.some((keyword) => normalized.includes(keyword))) return cat.id
  }
  return 'general'
}

export const CATEGORY_ICON_PATHS = {
  lacteos: '<path d="M8 8.5 9.6 3h4.8L16 8.5V20a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2Z"/><path d="M8 8.5h8"/><path d="M9.6 3 12 5.6 14.4 3"/>',
  carnes: '<path d="M6.6 14.8c-.8-2.5.4-5.3 2.8-6.5 2.6-1.3 5.6-1 7.5 1.2 2 2.3 2.1 5.8-.2 9-2 2.6-5.3 3.9-7.8 2.4-1.8-1-2.7-3-2.3-6.1Z"/><circle cx="10.6" cy="12.8" r=".85" fill="currentColor" stroke="none"/><circle cx="13.8" cy="15.1" r=".85" fill="currentColor" stroke="none"/>',
  frutas_verduras: '<path d="M12 9c-.5-1.7-2.3-2.5-3.9-1.9-2.6 1-3.6 4.4-2.6 7.5 1 3.3 3.3 6.2 5.5 6.2h2c2.2 0 4.5-2.9 5.5-6.2 1-3.1 0-6.5-2.6-7.5C14.3 6.5 12.5 7.3 12 9Z"/><path d="M12 9V5.4"/><path d="M12 5.4c.3-1.1 1.5-1.7 2.5-1.2"/>',
  granos: '<path d="M8.3 3.6h7.4l1.4 4.6L15.6 20a2 2 0 0 1-2 1.8h-3.2a2 2 0 0 1-2-1.8L6.9 8.2Z"/><path d="M9.8 3.6V2h4.4v1.6M8.6 8.4h6.8"/><circle cx="10.6" cy="12" r=".9" fill="currentColor" stroke="none"/><circle cx="13.6" cy="13.4" r=".9" fill="currentColor" stroke="none"/><circle cx="11" cy="16.2" r=".9" fill="currentColor" stroke="none"/>',
  bebidas: '<path d="M10.4 2h3.2v3.3c1.4.8 2.4 2.3 2.4 4V20a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V9.3c0-1.7 1-3.2 2.4-4Z"/><path d="M8.3 14.5h7.4"/>',
  panaderia: '<path d="M4 13c0-3.6 3.6-8.6 8-8.6s8 5 8 8.6a3.6 3.6 0 0 1-3.6 3.6H7.6A3.6 3.6 0 0 1 4 13Z"/><path d="M6.5 16.6 5.6 20M17.5 16.6l.9 3.4M12 4.4V2.2M9 8.4c1-1 2-1 3 0s2 1 3 0"/>',
  limpieza: '<path d="M10.6 2.4h2.8v2.3h1.7l1.6 2.1v2l-2.1 1.1V20a2 2 0 0 1-2 2h-1.4a2 2 0 0 1-2-2V10L9 8.8v-2l1.6-2.1Z"/><path d="M16.4 6.9 19 5.7M17.1 9.6l2.7-.7"/>',
  desechables: '<path d="M6.6 8.6h10.8l-1.1 11a2.2 2.2 0 0 1-2.2 2H9.9a2.2 2.2 0 0 1-2.2-2Z"/><path d="M5.4 8.6h13.2M8.4 8.6l.9-3.4h5.4l.9 3.4"/>',
  general: '<path d="M3 8 12 4l9 4-9 4-9-4Z"/><path d="M3 8v9l9 4 9-4V8"/><path d="M12 12v9"/>',
}
