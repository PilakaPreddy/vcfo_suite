"use client";

import { HTMLAttributes } from "react";
import { m, useReducedMotion } from "framer-motion";
import { cn } from '@/lib/utils';
import { cardHover } from '@/lib/shell/motion';

interface NoirCardProps extends HTMLAttributes<HTMLDivElement> {
  raised?: boolean;
  /** Border-only panel — no layered shadow. */
  flat?: boolean;
  interactive?: boolean;
}

function NoirCard({
  ref,
  className,
  raised,
  flat,
  interactive,
  onDrag: _onDrag,
  onDragStart: _onDragStart,
  onDragEnd: _onDragEnd,
  onAnimationStart: _onAnimationStart,
  onAnimationEnd: _onAnimationEnd,
  ...props
}: NoirCardProps & { ref?: React.Ref<HTMLDivElement> }) {
  const reduceMotion = useReducedMotion();
  const classes = cn(
    flat ? (raised ? 'surface-flat-raised' : 'surface-flat') : raised ? 'surface-raised' : 'surface',
    'border-line',
    interactive && 'transition-all duration-200 hover:border-brand/35 cursor-pointer',
    className,
  );

  if (interactive && !reduceMotion) {
    return (
      <m.div
        ref={ref}
        className={classes}
        whileHover={cardHover.whileHover}
        transition={cardHover.transition}
        {...props}
      />
    );
  }

  return <div ref={ref} className={classes} {...props} />;
}
