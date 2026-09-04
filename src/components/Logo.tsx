/**
 * The Lauva mark — leaf, wave, dot. Sourced directly from the brand SVG
 * (public/logo-mark.svg, also used as-is for the favicon at
 * src/app/icon.svg); the paths below are that same file's, not redrawn.
 */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 800 800" aria-hidden="true">
      <path
        d="M 382 470 C 330 425, 306 360, 330 284 C 350 221, 405 158, 478 104 C 492 184, 476 263, 431 324 C 411 351, 394 374, 382 405 C 374 426, 375 449, 382 470 Z"
        fill="#5C8A7A"
      />
      <path
        d="M 381 416 C 394 357, 426 291, 462 228 C 438 267, 408 310, 385 355 C 374 377, 369 397, 368 416 Z"
        fill="#FFFFFF"
      />
      <path
        d="M 382 400 C 368 475, 389 537, 445 570 C 474 587, 505 592, 536 587"
        fill="none"
        stroke="#5C8A7A"
        strokeWidth="13"
        strokeLinecap="round"
      />
      <path
        d="M 142 560 C 205 490, 278 456, 348 480 C 414 503, 467 559, 548 561 C 614 562, 664 530, 706 485 C 676 548, 622 600, 552 613 C 470 629, 413 588, 350 552 C 279 512, 214 522, 142 560 Z"
        fill="#6FA0D5"
      />
      <circle cx="571" cy="342" r="57" fill="#EFB0B8" />
    </svg>
  );
}
