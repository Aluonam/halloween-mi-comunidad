// Enlace público de la comunidad y su código QR (librería en js/vendor/qrcode.min.js, cargada en la página).

export const shareLink = () => `${location.origin}${location.pathname.replace(/[^/]*$/, "")}`;

export function qrSvg(text) {
  const qr = window.qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 6, margin: 3, scalable: true });
}
