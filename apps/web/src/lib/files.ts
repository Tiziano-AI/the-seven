export async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return window.btoa(binary);
}
