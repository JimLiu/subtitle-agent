interface SegmentContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onDuplicate: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onRemove: () => void;
}

// 预览画布右键菜单：提供复制/置顶/置底/删除等快捷操作
export const SegmentContextMenu: React.FC<SegmentContextMenuProps> = (props: SegmentContextMenuProps) => {
  const { x, y, onClose, onDuplicate, onBringToFront, onSendToBack, onRemove } = props;

  return (
    <div
      className="fixed z-50 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
      style={{ left: x, top: y }}
      role="menu"
    >
      <button
        type="button"
        className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        onClick={() => {
          onDuplicate();
          onClose();
        }}
      >
        Duplicate
      </button>
      <button
        type="button"
        className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        onClick={() => {
          onBringToFront();
          onClose();
        }}
      >
        Bring to Front
      </button>
      <button
        type="button"
        className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        onClick={() => {
          onSendToBack();
          onClose();
        }}
      >
        Send to Back
      </button>
      <button
        type="button"
        className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900"
        onClick={() => {
          onRemove();
          onClose();
        }}
      >
        Remove
      </button>
    </div>
  );
}
