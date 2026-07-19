export default function Toast({ show, message, lifted }) {
  return (
    <div
      className={`fixed right-4 z-[70] bg-green-500 text-white font-medium px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 transition-all duration-300 transform ${lifted ? 'bottom-24' : 'bottom-4'} ${
        show ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'
      }`}
    >
      <div className="w-5 h-5 bg-white rounded-full flex items-center justify-center">
        <span className="text-green-500 text-xs font-bold">✓</span>
      </div>
      {message}
    </div>
  );
}
