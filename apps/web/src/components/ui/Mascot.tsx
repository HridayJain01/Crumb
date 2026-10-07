/** Crumb, the friendly cookie. Used for empty, loading and error states — never for nagging. */
export function Mascot({
  mood = 'happy',
  size = 96,
  className = '',
}: {
  mood?: 'happy' | 'thinking' | 'oops' | 'sleepy';
  size?: number;
  className?: string;
}) {
  const mouth = {
    happy: 'M40 66 Q50 75 60 66',
    thinking: 'M42 68 L58 66',
    oops: 'M43 70 Q50 64 57 70',
    sleepy: 'M44 68 Q50 71 56 68',
  }[mood];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      aria-hidden
      focusable="false"
    >
      <circle cx="50" cy="52" r="36" fill="#E2A052" />
      <circle cx="50" cy="52" r="33" fill="#F6C177" />
      <circle cx="76" cy="26" r="12" fill="var(--color-bg)" />
      <circle cx="84" cy="40" r="7" fill="var(--color-bg)" />
      <circle cx="30" cy="40" r="3" fill="#6B3E26" />
      <circle cx="62" cy="78" r="2.6" fill="#6B3E26" />
      <circle cx="28" cy="66" r="2.4" fill="#6B3E26" />
      {mood === 'sleepy' ? (
        <>
          <path
            d="M37 50 Q41 53 45 50"
            stroke="#2A1E17"
            strokeWidth="2.6"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M55 50 Q59 53 63 50"
            stroke="#2A1E17"
            strokeWidth="2.6"
            fill="none"
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <circle cx="41" cy="50" r="3.6" fill="#2A1E17" />
          <circle cx="59" cy="50" r="3.6" fill="#2A1E17" />
          <circle cx="42.2" cy="48.8" r="1.1" fill="#fff" />
          <circle cx="60.2" cy="48.8" r="1.1" fill="#fff" />
        </>
      )}
      <circle cx="35" cy="59" r="4" fill="#F28B6B" opacity="0.55" />
      <circle cx="65" cy="59" r="4" fill="#F28B6B" opacity="0.55" />
      <path d={mouth} stroke="#2A1E17" strokeWidth="2.8" fill="none" strokeLinecap="round" />
      {mood === 'thinking' && <circle cx="80" cy="64" r="3" fill="#E2A052" opacity="0.8" />}
    </svg>
  );
}
