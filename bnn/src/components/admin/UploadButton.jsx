import { useState, useRef } from "react";
import { uploadImageFile } from "../../utils/upload";

export default function UploadButton({ onUploaded, token }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const handleChange = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    setUploading(true);
    try {
      const urls = [];
      for (const file of files) {
        const result = await uploadImageFile(file, token);
        if (result.success) urls.push(result.url);
        else alert(result.message || "อัปโหลดไม่สำเร็จ");
      }
      if (urls.length) onUploaded(urls);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" multiple onChange={handleChange} className="hidden" />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="text-xs font-medium text-[#B8860B] hover:underline disabled:opacity-50 flex-shrink-0"
      >
        {uploading ? "กำลังอัปโหลด..." : "+ อัปโหลดรูปจากเครื่อง"}
      </button>
    </>
  );
}
