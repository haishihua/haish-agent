// Adapted from Animate UI's Radix Dialog/AlertDialog primitives.
// Controlled-only surface; see LICENSE-animate-ui.txt for upstream terms.
import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import './animate-dialog.css';

export function AnimateDialog({ open, danger, title, description, children, busy, onClose, onOpenAutoFocus, onCloseAutoFocus }) {
  const Primitive = danger ? AlertDialog : Dialog;
  const reducedMotion = useReducedMotion();
  const hidden = reducedMotion ? { opacity: 0 } : {
    opacity: 0, filter: 'blur(4px)', transform: 'perspective(500px) rotateX(-20deg) scale(0.8)',
  };
  return (
    <Primitive.Root open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
      <AnimatePresence>
        {open ? <Primitive.Portal forceMount>
          <Primitive.Overlay asChild forceMount>
            <motion.div className="haish-dialog-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.2 }} />
          </Primitive.Overlay>
          <Primitive.Content asChild forceMount
            onOpenAutoFocus={onOpenAutoFocus}
            onCloseAutoFocus={onCloseAutoFocus}
            onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}
          >
            <motion.div className={`haish-dialog${danger ? ' is-danger' : ''}`} aria-busy={busy}
              initial={hidden} animate={{ opacity: 1, filter: 'blur(0px)', transform: 'perspective(500px) rotateX(0deg) scale(1)' }} exit={hidden}
              transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 150, damping: 25 }}>
              <Primitive.Title className="haish-dialog-title">{title}</Primitive.Title>
              <Primitive.Description className={description ? 'haish-dialog-description' : 'haish-dialog-sr-only'}>{description || title}</Primitive.Description>
              {children}
            </motion.div>
          </Primitive.Content>
        </Primitive.Portal> : null}
      </AnimatePresence>
    </Primitive.Root>
  );
}
