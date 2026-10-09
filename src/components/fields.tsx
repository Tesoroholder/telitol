import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

const fieldClass =
  "w-full rounded-lg border border-line bg-card px-3 text-base text-ink outline-none placeholder:text-muted focus-visible:border-green";

export function TextField({
  label,
  ...props
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      <input id={id} className={`${fieldClass} h-12`} {...props} />
    </div>
  );
}

export function AreaField({
  label,
  ...props
}: { label: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      <textarea id={id} className={`${fieldClass} min-h-32 resize-y py-3`} {...props} />
    </div>
  );
}

export function PrimaryButton({
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={`inline-flex h-12 items-center justify-center rounded-full bg-green px-5 text-base font-semibold text-on-green transition-opacity duration-150 hover:bg-green-deep active:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

export function SecondaryButton({
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={`inline-flex h-12 items-center justify-center rounded-full border border-line bg-card px-5 text-base font-semibold text-ink transition-opacity duration-150 hover:bg-mint active:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

export function ErrorNote({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm font-medium text-ink">
      {message}
    </p>
  );
}
