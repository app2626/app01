import { X } from "lucide-react";

export default function ListEditor({ items, onChange, newItem, renderRow, addLabel = "+ เพิ่มรายการ" }) {
  const updateItem = (idx, patch) => {
    const next = items.slice();
    next[idx] = typeof patch === "function" ? patch(next[idx]) : { ...next[idx], ...patch };
    onChange(next);
  };

  const removeItem = (idx) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  const addItem = () => {
    onChange([...items, typeof newItem === "function" ? newItem() : newItem]);
  };

  return (
    <div className="space-y-2">
      {items.map((item, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2">
            {renderRow(item, (patch) => updateItem(idx, patch))}
          </div>
          <button
            type="button"
            onClick={() => removeItem(idx)}
            className="text-gray-400 hover:text-red-600 flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addItem}
        className="text-xs font-medium text-[#B8860B] hover:underline"
      >
        {addLabel}
      </button>
    </div>
  );
}
