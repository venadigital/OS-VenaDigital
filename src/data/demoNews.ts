// Sample news for demo mode. Images are generated here, so demo mode needs no network.
import { subDays, subHours, subMinutes } from 'date-fns';
import type { NewsItem, NewsSource } from './types';

const SOURCES: [slug: string, name: string, site: string][] = [
  ['anthropic', 'Anthropic', 'anthropic.com'],
  ['genbeta', 'Genbeta', 'genbeta.com'],
  ['openai', 'OpenAI', 'openai.com'],
  ['techcrunch', 'TechCrunch', 'techcrunch.com'],
  ['the-decoder', 'The Decoder', 'the-decoder.com'],
  ['the-rundown', 'The Rundown', 'therundown.ai'],
  ['venturebeat', 'VentureBeat', 'venturebeat.com'],
  ['xataka', 'Xataka', 'xataka.com'],
];

const picture = (a: string, b: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/><circle cx="290" cy="90" r="70" fill="#fff" fill-opacity=".22"/><circle cx="120" cy="220" r="110" fill="#fff" fill-opacity=".12"/></svg>`,
  )}`;

export function seedNews(now: Date): { sources: NewsSource[]; items: NewsItem[] } {
  const checked = subMinutes(now, 12).toISOString();
  const sources: NewsSource[] = SOURCES.map(([slug, name, site]) => ({ slug, name, site, last_checked_at: checked, last_ok_at: checked, last_error: null }));
  const rows: [source: string, published: Date, title: string, summary: string | null, image: string | null][] = [
    ['xataka', subHours(now, 1), 'Los modelos de razonamiento llegan a los teléfonos de gama media', 'Ejecutar un modelo en el propio dispositivo era cosa de la gama alta. Los nuevos chips cambian las cuentas y abren la puerta a asistentes que funcionan sin conexión.', picture('#5b7fd6', '#9fc2ee')],
    ['the-decoder', subHours(now, 2), 'Un estudio mide cuánto tiempo ahorran realmente los agentes en tareas de oficina', 'Los equipos que definieron tareas concretas ahorraron más que quienes solo dieron acceso a la herramienta, según un análisis de seis meses en cuarenta empresas.', picture('#3f8f7a', '#a7dcc8')],
    ['openai', subHours(now, 3), 'Nuevas opciones de privacidad para cuentas de equipo', 'Los administradores pueden decidir cuánto tiempo se conservan las conversaciones y qué conectores están disponibles.', null],
    ['techcrunch', subHours(now, 5), 'Una startup de voz levanta su ronda semilla para automatizar la atención al cliente', 'La empresa, de cinco meses, asegura que ya atiende el 40 % de las llamadas de sus primeros clientes sin intervención humana.', picture('#c26a4a', '#f0bd97')],
    ['venturebeat', subHours(now, 6), 'Por qué las empresas están volviendo a los modelos pequeños', null, null],
    ['genbeta', subDays(now, 1), 'Cinco formas de usar la IA para ordenar tus correos sin instalar nada', 'Basta con las funciones que ya traen los servicios de correo más usados. Te contamos cómo activarlas y qué conviene revisar antes.', picture('#8a6bb8', '#cdb9e6')],
    ['anthropic', subDays(now, 1), 'Lo que aprendimos de un año de investigación con universidades', 'Publicamos un resumen de los proyectos, los resultados y lo que cambiaríamos si empezáramos hoy.', picture('#b98a3e', '#ecd49b')],
    ['the-rundown', subDays(now, 1), 'Los generadores de video ya editan por escenas', 'PLUS: Cómo convertir un guion en un storyboard en diez minutos.', picture('#4b6a88', '#a3bdd4')],
    ['xataka', subDays(now, 2), 'La demanda de centros de datos empuja los precios de la memoria', 'Los fabricantes priorizan los chips para servidores y el mercado de consumo lo nota en los precios de este trimestre.', picture('#7b8a4a', '#cfd9a3')],
    ['techcrunch', subDays(now, 2), 'Las herramientas de código se pelean por el mismo comprador', 'Los equipos de ingeniería ya no comparan solo calidad: el costo por tarea se ha vuelto la métrica que decide la compra.', picture('#a84f6c', '#e9b4c6')],
  ];
  const items: NewsItem[] = rows.map(([source, published, title, summary, image], i) => ({
    id: `demo-news-${i}`,
    source,
    url: `https://${SOURCES.find((s) => s[0] === source)?.[2]}/`,
    title,
    summary,
    image_url: image,
    published_at: published.toISOString(),
  }));
  return { sources, items };
}
