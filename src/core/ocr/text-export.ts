export function ocrTextFilename(imageName: string): string {
  const stem = imageName.replace(/\.(png|jpe?g|webp)$/i, "").trim() || "screenshot";
  return `${stem}-text.txt`;
}

export function ocrTextBlob(text: string): Blob {
  return new Blob([text], { type: "text/plain;charset=utf-8" });
}

export function downloadOcrText(text: string, imageName: string): void {
  const url = URL.createObjectURL(ocrTextBlob(text));
  const link = document.createElement("a");
  link.href = url;
  link.download = ocrTextFilename(imageName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Let the browser begin reading the Blob before revoking the temporary URL.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
