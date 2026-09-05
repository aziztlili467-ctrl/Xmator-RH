export default function Card({ children, className = '', hover = true, ...props }) {
  return <div className={`card fade-in ${hover ? '' : '!transform-none !shadow-sm hover:!transform-none' } ${className}`} {...props}>{children}</div>;
}
