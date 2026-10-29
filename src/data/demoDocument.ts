// Sample PDF for the demo "Documentos" section, built on demand (pdf-lib loads only then).
// Real text, so selecting and highlighting it works like with any PDF.

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: 'Propuesta · Academia IA para equipos',
    body: [
      'Este documento resume la propuesta de formación práctica en inteligencia artificial para el',
      'equipo comercial y de operaciones. El objetivo es que cada persona termine el programa con',
      'al menos tres flujos de trabajo automatizados y medibles en su día a día.',
      '',
      'Alcance',
      'Seis sesiones en vivo de dos horas, una por semana, con ejercicios sobre casos reales de la',
      'empresa. Entre sesiones, acompañamiento por chat y revisión de los flujos construidos.',
      '',
      'Resultados esperados',
      '• Redacción de propuestas y correos con asistentes de IA, con plantillas propias.',
      '• Resúmenes automáticos de reuniones conectados al CRM.',
      '• Un tablero de seguimiento del tiempo ahorrado por persona y por proceso.',
    ],
  },
  {
    title: 'Cronograma',
    body: [
      'Semana 1 · Fundamentos: qué puede y qué no puede hacer un modelo de lenguaje.',
      'Semana 2 · Escritura asistida: correos, propuestas y documentos con estilo propio.',
      'Semana 3 · Investigación: búsqueda con fuentes y verificación de datos.',
      'Semana 4 · Automatización: flujos con n8n entre el correo, el CRM y las hojas de cálculo.',
      'Semana 5 · Agentes: tareas de varios pasos con supervisión humana.',
      'Semana 6 · Cierre: presentación de los flujos de cada persona y plan de continuidad.',
      '',
      'Cada sesión deja una tarea corta. La siguiente empieza revisando dos o tres de esas tareas',
      'para aprender de los aciertos y de los errores del grupo.',
    ],
  },
  {
    title: 'Inversión y condiciones',
    body: [
      'Valor del programa: COP 9.800.000 para un grupo de hasta doce personas.',
      'Forma de pago: 50 % al firmar y 50 % al terminar la tercera semana.',
      'Incluye materiales, grabaciones de las sesiones y un mes de soporte después del cierre.',
      '',
      'Vigencia de la propuesta: treinta días calendario desde la fecha de envío.',
      '',
      'Firma del cliente: ______________________________',
    ],
  },
];

export async function buildDemoPdf(): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  SECTIONS.forEach((s, i) => {
    const page = pdf.addPage([595.28, 841.89]); // A4
    const left = 64;
    let y = 841.89 - 90;
    page.drawText('Vena Digital', { x: left, y: 841.89 - 52, size: 9, font: bold, color: rgb(0.45, 0.44, 0.42) });
    page.drawText(s.title, { x: left, y, size: 20, font: bold, color: rgb(0.12, 0.12, 0.11) });
    y -= 40;
    for (const line of s.body) {
      const heading = line && !line.includes(' ') ? true : ['Alcance', 'Resultados esperados'].includes(line);
      if (line) page.drawText(line, { x: left, y, size: heading ? 13 : 11, font: heading ? bold : regular, color: rgb(0.18, 0.18, 0.17) });
      y -= heading ? 22 : 18;
    }
    page.drawText(`${i + 1} / ${SECTIONS.length}`, { x: 595.28 - left - 20, y: 40, size: 9, font: regular, color: rgb(0.55, 0.54, 0.52) });
  });
  return new Blob([(await pdf.save()) as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
}
