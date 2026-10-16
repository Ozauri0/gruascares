// Contenido editable de la web pública (textos e imágenes).
//
// Esta lista es la única fuente de verdad: define cada campo, dónde aparece en el panel de administración
// y su valor original. El backend solo guarda lo que el administrador cambió (GET /api/content) y todo lo
// demás usa el `default` de aquí. Para volver editable un texto nuevo basta con agregarlo a `SECTIONS`.
//
// Formato de los textos "rich": Enter = salto de línea y *texto* = énfasis en verde.

export type FieldKind = "text" | "rich" | "textarea" | "image";
export type ContentField = { key: string; label: string; kind: FieldKind; default: string; hint?: string };
export type ContentSection = { id: string; title: string; description?: string; fields: ContentField[] };

const text = (key: string, label: string, def: string, hint?: string): ContentField => ({ key, label, kind: "text", default: def, hint });
const rich = (key: string, label: string, def: string): ContentField => ({ key, label, kind: "rich", default: def });
const area = (key: string, label: string, def: string): ContentField => ({ key, label, kind: "textarea", default: def });
const image = (key: string, label: string, def: string, hint?: string): ContentField => ({ key, label, kind: "image", default: def, hint });

/** Imágenes locales que se pueden elegir desde la galería del panel. */
export const GALLERY_IMAGES = [
  "/images/carousel-01.webp",
  "/images/carousel-02.webp",
  "/images/carousel-03.webp",
  "/images/carousel-04.webp",
  "/images/hero-01.jpg",
  "/images/hero-02.jpg",
  "/images/hero-03.jpg",
  "/images/service-plataforma.jpg",
  "/images/service-carga.jpg",
  "/images/service-alcance.jpg",
  "/images/service-servicios.jpg",
  "/images/logo.png",
];

const slide = (n: number, label: string, detail: string): ContentField[] => [
  image(`hero.slide${n}.image`, `Imagen ${n}`, `/images/carousel-0${n}.webp`),
  text(`hero.slide${n}.label`, `Título ${n}`, label),
  text(`hero.slide${n}.detail`, `Detalle ${n}`, detail),
];

const service = (n: number, title: string, body: string, img: string): ContentField[] => [
  text(`service${n}.title`, `Servicio ${n}: nombre`, title),
  area(`service${n}.text`, `Servicio ${n}: descripción`, body),
  image(`service${n}.image`, `Servicio ${n}: imagen`, img),
];

export const SECTIONS: ContentSection[] = [
  {
    id: "general",
    title: "General",
    description: "Barra superior y logo, presentes en todo el sitio.",
    fields: [
      text("topbar.text", "Barra superior: mensaje", "Atención de emergencias 24/7"),
      text("topbar.location", "Barra superior: ubicación", "Villarrica · IX Región"),
      image("site.logo.image", "Logo", "/images/logo.png", "Se usa en el menú y en el pie de página."),
    ],
  },
  {
    id: "hero",
    title: "Portada (hero)",
    description: "Lo primero que ve el visitante: título, texto y carrusel de imágenes.",
    fields: [
      text("hero.eyebrow", "Etiqueta superior", "Grúas Cares · Villarrica"),
      rich("hero.title", "Título", "Rescate y\n*transporte*\ncuando lo necesitas."),
      area("hero.copy", "Texto", "Servicio de grúas rápido y confiable en Villarrica y toda la IX Región. Atendemos emergencias las 24 horas."),
      text("hero.cta", "Botón principal", "Llámanos ahora"),
      text("hero.link", "Enlace secundario", "Ver servicios"),
      ...slide(1, "Rescate vehicular", "Atención las 24 horas"),
      ...slide(2, "Transporte de cargas", "Seguridad y eficiencia"),
      ...slide(3, "Camiones grúa", "Villarrica · IX Región"),
      ...slide(4, "Grúas Cares", "Servicio confiable"),
      text("hero.meta1", "Franja inferior: izquierda", "Villarrica"),
      text("hero.meta2", "Franja inferior: centro", "IX Región de la Araucanía"),
    ],
  },
  {
    id: "about",
    title: "Nosotros",
    fields: [
      text("about.eyebrow", "Etiqueta superior", "Transporte seguro"),
      rich("about.title", "Título", "Tu carga es\nnuestra *responsabilidad.*"),
      area("about.text", "Texto", "Somos Grúas Cares, especialistas en transporte de cargas pesadas y servicios de camiones grúa. Contamos con una flota moderna y un equipo de profesionales comprometidos con la puntualidad, la seguridad y la calidad."),
      text("about.link", "Enlace", "Explora el catálogo"),
    ],
  },
  {
    id: "services",
    title: "Servicios",
    fields: [
      text("services.eyebrow", "Etiqueta superior", "Lo que hacemos"),
      rich("services.title", "Título", "Soluciones para\n*seguir avanzando.*"),
      text("services.note", "Nota", "Una flota preparada y un equipo que entiende que tu tiempo también se transporta."),
      text("services.cta", "Enlace de cada tarjeta", "Solicitar servicio"),
      ...service(1, "Grúa de plataforma hidráulica", "Servicio de grúa para el traslado seguro de vehículos, con atención las 24 horas.", "/images/service-plataforma.jpg"),
      ...service(2, "Transporte de cargas pesadas", "Soluciones de transporte seguras, eficientes y adaptadas a cada necesidad.", "/images/service-carga.jpg"),
      ...service(3, "Camiones grúa", "Servicios de camiones grúa con un equipo comprometido con la puntualidad y la calidad.", "/images/service-alcance.jpg"),
    ],
  },
  {
    id: "catalog",
    title: "Bloque de catálogo (inicio)",
    fields: [
      image("catalog.image", "Imagen", "/images/hero-01.jpg"),
      text("catalog.eyebrow", "Etiqueta superior", "Catálogo de soluciones"),
      rich("catalog.title", "Título", "Una flota\npara cada\n*necesidad.*"),
      area("catalog.text", "Texto", "Conoce los servicios de Grúas Cares y encuentra una solución segura, eficiente y adaptada a tu traslado."),
      text("catalog.button", "Botón", "Ver catálogo completo"),
      text("catalog.stat1.value", "Dato 1: valor", "24/7"),
      text("catalog.stat1.label", "Dato 1: texto", "Atención"),
      text("catalog.stat2.value", "Dato 2: valor", "IX"),
      text("catalog.stat2.label", "Dato 2: texto", "Región"),
      text("catalog.stat3.value", "Dato 3: valor", "3"),
      text("catalog.stat3.label", "Dato 3: texto", "Teléfonos"),
    ],
  },
  {
    id: "booking",
    title: "Agenda (inicio)",
    fields: [
      text("booking.eyebrow", "Etiqueta superior", "Agenda tu servicio"),
      rich("booking.title", "Título", "Cuéntanos qué\n*necesitas mover.*"),
      area("booking.copy", "Texto", "Déjanos tus datos y te contactaremos para coordinar la mejor solución."),
      text("booking.urgent", "Pregunta de urgencia", "¿Es urgente?"),
      text("booking.urgent_link", "Enlace de urgencia", "Llámanos ahora"),
    ],
  },
  {
    id: "map",
    title: "Ubicación",
    fields: [
      text("map.eyebrow", "Etiqueta superior", "Dónde estamos"),
      rich("map.title", "Título", "Encuéntranos en *Villarrica.*"),
      text("map.note", "Nota", "Atención de emergencias 24/7 en Villarrica y la IX Región de la Araucanía."),
    ],
  },
  {
    id: "footer",
    title: "Pie de página",
    description: "Los teléfonos no se editan aquí: son datos verificados del negocio.",
    fields: [
      text("footer.bottom1", "Línea inferior 1", "Grúas Cares Villarrica"),
      text("footer.bottom2", "Línea inferior 2", "IX Región de la Araucanía y alrededores"),
      text("footer.inner1", "Pie de páginas internas: línea 1", "Villarrica · IX Región"),
      text("footer.inner2", "Pie de páginas internas: línea 2", "La Araucanía y alrededores"),
    ],
  },
  {
    id: "shop",
    title: "Tienda (/catalogo)",
    fields: [
      text("shop.eyebrow", "Etiqueta superior", "Tienda Cares"),
      rich("shop.title", "Título", "Todo para\n*seguir en ruta.*"),
      area("shop.text", "Texto", "Productos e insumos para el cuidado, seguridad y mantenimiento de autos, camiones y maquinaria."),
    ],
  },
];

export const ALL_FIELDS: ContentField[] = SECTIONS.flatMap((section) => section.fields);
export const DEFAULTS: Record<string, string> = Object.fromEntries(ALL_FIELDS.map((f) => [f.key, f.default]));

export type ContentOverrides = Record<string, string>;

/** Interruptor (no es un texto editable): "1" oculta la sección Top ventas de /catalogo. Se cambia desde /admin/catalogo. */
export const SHOP_TOP_HIDDEN_KEY = "shop.top.hidden";

/** Valor de un campo: lo editado por el admin o, si no hay, el original. */
export function resolve(overrides: ContentOverrides, key: string): string {
  return overrides[key] ?? DEFAULTS[key] ?? "";
}
