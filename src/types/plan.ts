// Strongly-typed floor-plan data model.
//
// UNITS: every coordinate and length in the model is stored in INCHES, in a
// y-down plan coordinate system ("plan space"). Display units (ft-in, decimal
// feet, metric) are a presentation concern handled by src/lib/units.ts.

export interface Pt {
  x: number;
  y: number;
}

export type LayerId = 'background' | 'rooms' | 'walls' | 'doors' | 'furniture' | 'aisles' | 'annotations';

export interface LayerState {
  id: LayerId;
  name: string;
  visible: boolean;
  locked: boolean;
}

interface BaseObject {
  id: string;
  name: string;
  locked: boolean;
  notes: string;
  /** Furniture grouping. Selecting one member selects the group. */
  groupId?: string;
  /**
   * Set when the object is fixed by an outside party (e.g. "Contractor-fixed").
   * Fixed objects start locked; the UI asks for confirmation before unlocking.
   */
  fixed?: string;
}

export type RoomType =
  | 'conference'
  | 'office'
  | 'kitchen'
  | 'it'
  | 'storage'
  | 'open'
  | 'hall'
  | 'entrance'
  | 'cubicle-area'
  | 'other';

export interface LabelStyle {
  fontSize: number; // points at zoom 1 (plan inches)
  fontWeight: 'normal' | 'bold';
  color: string;
  align: 'left' | 'center' | 'right';
  rotation: number;
  background: string; // '' = transparent
  /** Label offset from the room centroid (plan inches). */
  offset: Pt;
}

export interface Room extends BaseObject {
  kind: 'room';
  roomType: RoomType;
  /** Polygon vertices in plan space (closed implicitly). */
  points: Pt[];
  fill: string;
  stroke: string;
  label: LabelStyle;
  showArea: boolean;
  /** Hide the room's name label (and area) on the plan. */
  hideLabel?: boolean;
  /** Preliminary planning inputs, not verified measurements. */
  planning?: {
    widthFt?: number;
    lengthFt?: number;
    targetMin?: number;
    targetMax?: number;
    department?: string;
  };
  /** True only when the user explicitly marks dimensions as field-verified. */
  dimensionsVerified: boolean;
}

export interface Wall extends BaseObject {
  kind: 'wall';
  a: Pt;
  b: Pt;
  thickness: number;
  color: string;
  wallType: 'exterior' | 'interior' | 'partition';
  /** Text shown instead of the measured length (e.g. a marked size when the drawing is not to scale). */
  lengthLabel?: string;
}

export interface Door extends BaseObject {
  kind: 'door';
  /** Hinge point. */
  x: number;
  y: number;
  /** Direction of the closed leaf, hinge -> latch, in degrees. */
  rotation: number;
  width: number;
  /** Which side of the leaf the door swings to: 1 = clockwise (+90°), -1 = counter-clockwise. */
  swing: 1 | -1;
  color: string;
}

export type FurnitureType =
  | 'cubicle'
  | 'desk'
  | 'shared-desk'
  | 'bench'
  | 'l-desk'
  | 'chair'
  | 'conference-table'
  | 'storage-cabinet'
  | 'filing-cabinet'
  | 'shelving'
  | 'printer'
  | 'partition'
  | 'phone-booth'
  | 'round-table'
  | 'tv'
  | 'whiteboard'
  | 'plant'
  | 'custom';

/**
 * Which side of a workstation needs clear floor:
 * - 'front-aisle': cubicle opening must face an aisle at least `minAisleWidth` deep
 * - 'front-chair': desk needs `chairClearance` behind the user (front side)
 * - 'both-chair': two-sided bench / shared desk; chair zone on front and back
 * - 'none': storage, plants, etc.
 */
export type AccessRule = 'front-aisle' | 'front-chair' | 'both-chair' | 'none';

export interface Furniture extends BaseObject {
  kind: 'furniture';
  type: FurnitureType;
  /** Center point. */
  x: number;
  y: number;
  /** Local x extent. */
  width: number;
  /** Local y extent. The "front" (opening / user side) is local +y. */
  depth: number;
  rotation: number;
  color: string;
  isWorkstation: boolean;
  seats: number;
  access: AccessRule;
  partitionHeight?: number;
  assignedTo: string[]; // one name per seat ('' = unassigned)
  department: string;
  deskType: string;
  equipment: string[];
  /** Exempt from furniture-furniture collision (e.g. chairs tucked under desks). */
  overlapsAllowed?: boolean;
  /** Inventory line this piece draws from, as "Area|Item" (e.g. "Cubicles|Long cubicle walls"). */
  inventoryItem?: string;
}

export interface TextLabel extends BaseObject {
  kind: 'label';
  x: number;
  y: number;
  text: string;
  style: Omit<LabelStyle, 'offset'>;
  /** Optional callout leader target. */
  callout?: Pt;
}

export interface Dimension extends BaseObject {
  kind: 'dimension';
  a: Pt;
  b: Pt;
  /** Perpendicular offset of the dimension line (plan inches). */
  offset: number;
  /**
   * Label-only override. When set, the label text differs from the geometry;
   * the canvas marks it with an asterisk and validation raises a warning.
   */
  labelOverride?: string;
  /** If attached to a room edge, editing the geometry moves that edge's end vertex. */
  attach?: { roomId: string; edgeIndex: number };
  color: string;
}

export interface Aisle extends BaseObject {
  kind: 'aisle';
  x: number;
  y: number;
  width: number; // along the walking direction
  depth: number; // clear width of the aisle
  rotation: number;
  color: string;
}

export type PlanObject = Room | Wall | Door | Furniture | TextLabel | Dimension | Aisle;
export type ObjectKind = PlanObject['kind'];

export interface Background {
  fileName: string;
  sourceType: 'pdf' | 'image';
  /** Original file bytes (base64). Never modified - the unaltered reference. */
  originalBase64?: string;
  page: number;
  pageCount: number;
  /** Rendered raster of the current page (data URL). */
  imageDataUrl: string;
  imageWidth: number;
  imageHeight: number;
  /** Placement of the image's top-left in plan space. */
  x: number;
  y: number;
  /** Plan inches per image pixel. */
  scale: number;
  rotation: number;
  opacity: number;
  crop?: { x: number; y: number; width: number; height: number };
  visible: boolean;
  locked: boolean;
  calibrated: boolean;
  calibration?: { measuredInches: number; realInches: number; date: string };
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  objects: PlanObject[];
  /** 'cubicle-walls': the Cubicle walls tab's layout (cubicles as loose cube walls). */
  purpose?: 'cubicle-walls' | 'cubicle-sizes';
  /** For the walls layout: the floor plan layout it was made from. */
  sourceId?: string;
  /** For the walls layout: the suggested Office 1 furniture has been placed once. */
  office1Suggested?: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export type DisplayUnits = 'ft-in' | 'ft-decimal' | 'metric';

export interface PlanSettings {
  units: DisplayUnits;
  gridSize: number; // inches
  snapToGrid: boolean;
  showGrid: boolean;
  showGuides: boolean;
  /** User-configured clearance thresholds (planning inputs, not code-verified). */
  minAisleWidth: number;
  chairClearance: number;
  wallTolerance: number;
  doorClearance: number;
}

export interface FurnitureTemplate {
  id: string;
  label: string;
  category: 'Workstations' | 'Cube walls' | 'Cubicle furniture' | 'Seating' | 'Tables' | 'Storage' | 'Equipment' | 'Architecture' | 'Decor' | 'Custom';
  type: FurnitureType;
  width: number;
  depth: number;
  color: string;
  isWorkstation: boolean;
  seats: number;
  access: AccessRule;
  partitionHeight?: number;
  deskType: string;
  overlapsAllowed?: boolean;
  /** Inventory line ("Area|Item") that pieces made from this template count against. */
  inventoryItem?: string;
  builtIn: boolean;
}

/** One line of the furniture inventory legend (what the office owns today). */
export interface InventoryItem {
  id: string;
  /** Where it lives, e.g. "Cubicles", "IT room". Rows with the same area are listed together. */
  area: string;
  item: string;
  /** Count; null when not known yet. */
  qty: number | null;
  /** Free-text size, e.g. 4' x 2' or 34½" W x 13½" D x 66" H. */
  size: string;
}

/** One line on the Checklist tab. */
export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Project {
  schema: 'trinity-floor-plan';
  version: 1;
  name: string;
  /** Street address, shown as the plan's header. */
  address?: string;
  /** Furniture inventory shown in the legend. */
  inventory?: InventoryItem[];
  /** Show the inventory legend over the plan (default true). */
  showInventory?: boolean;
  /** The Checklist tab's items, in order. */
  checklist?: ChecklistItem[];
  settings: PlanSettings;
  layers: LayerState[];
  background?: Background;
  scenarios: Scenario[];
  activeScenarioId: string;
  customTemplates: FurnitureTemplate[];
  employees: { name: string; department: string }[];
  createdAt: string;
  updatedAt: string;
}

export const LAYER_OF: Record<ObjectKind, LayerId> = {
  room: 'rooms',
  wall: 'walls',
  door: 'doors',
  furniture: 'furniture',
  label: 'annotations',
  dimension: 'annotations',
  aisle: 'aisles',
};
