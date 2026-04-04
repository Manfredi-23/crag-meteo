'use client';

import React, { useCallback, useEffect } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Remove',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onCancel]);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onCancel();
  }, [onCancel]);

  return (
    <div
      className={`modal-overlay${open ? ' open' : ''}`}
      onClick={handleOverlayClick}
    >
      <div className="modal" style={{ maxWidth: 360 }}>
        <h2>{title}</h2>
        <p style={{ padding: '0 1rem 1rem', margin: 0, color: 'var(--text-secondary)' }}>
          {message}
        </p>
        <div className="modal-btns">
          <button className="btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className="btn-primary" style={{ background: 'var(--red)' }} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
