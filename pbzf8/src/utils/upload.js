import { isGasEnv } from "./gas";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function uploadImageFile(file, token) {
  if (file.size > MAX_FILE_SIZE) {
    return Promise.resolve({ success: false, message: "ไฟล์ใหญ่เกินไป (สูงสุด 5MB)" });
  }

  if (!isGasEnv()) {
    return Promise.resolve({ success: true, url: URL.createObjectURL(file) });
  }

  return fileToBase64(file).then(base64 => new Promise((resolve, reject) => {
    google.script.run
      .withSuccessHandler(resolve)
      .withFailureHandler(err => reject(err))
      .uploadProductImage(base64, file.name, file.type, token);
  }));
}
