"use client";

import { useEffect, useMemo, useState } from "react";
import type { SlabAITool, ToolField } from "@/lib/ai-tools/types";
import { cn } from "@/lib/utils";

type Props = {
  tool: SlabAITool;
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  errors: Record<string, string>;
  disabled?: boolean;
};

function defaultValues(tool: SlabAITool): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of tool.fields) {
    if (field.type === "checkbox") {
      out[field.name] = field.name === "templateRequired" || field.name === "installationRequired";
      continue;
    }
    if (field.type === "number") {
      out[field.name] = field.name === "quantity" ? 1 : field.name.includes("Cutout") || field.name === "faucetHoles" ? 0 : "";
      continue;
    }
    if (field.type === "select" && field.options?.[0]) {
      out[field.name] = field.options[0].value;
      continue;
    }
    out[field.name] = "";
  }
  return out;
}

export function buildDefaultFormValues(tool: SlabAITool) {
  return defaultValues(tool);
}

export function ToolForm({ tool, values, onChange, errors, disabled }: Props) {
  function setField(name: string, value: unknown) {
    onChange({ ...values, [name]: value });
  }

  return (
    <div className="space-y-4">
      {tool.fields.map((field) => (
        <Field
          key={field.name}
          field={field}
          value={values[field.name]}
          error={errors[field.name]}
          disabled={disabled}
          onChange={(v) => setField(field.name, v)}
        />
      ))}
    </div>
  );
}

function Field({
  field,
  value,
  error,
  disabled,
  onChange,
}: {
  field: ToolField;
  value: unknown;
  error?: string;
  disabled?: boolean;
  onChange: (v: unknown) => void;
}) {
  const id = `field-${field.name}`;
  const label = (
    <label htmlFor={id} className="mb-1.5 flex items-baseline gap-1 text-sm font-medium text-[var(--fg)]">
      {field.label}
      {field.required ? <span className="text-[var(--danger)]">*</span> : <span className="text-xs font-normal text-[var(--muted-fg)]">(optional)</span>}
    </label>
  );

  const help = field.helpText ? (
    <p className="mt-1 text-xs text-[var(--muted-fg)]">{field.helpText}</p>
  ) : null;

  const err = error ? (
    <p className="mt-1 text-xs text-[var(--danger)]" role="alert">
      {error}
    </p>
  ) : null;

  const controlClass = cn(
    "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--fg)] outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-60",
    error && "border-[var(--danger)]"
  );

  if (field.type === "checkbox") {
    return (
      <div>
        <label className="flex items-start gap-3 text-sm text-[var(--fg)]">
          <input
            id={id}
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-[var(--border)]"
            checked={Boolean(value)}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span>
            <span className="font-medium">{field.label}</span>
            {field.helpText ? <span className="mt-0.5 block text-xs text-[var(--muted-fg)]">{field.helpText}</span> : null}
          </span>
        </label>
        {err}
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <div>
        {label}
        <textarea
          id={id}
          rows={4}
          className={controlClass}
          placeholder={field.placeholder}
          value={String(value ?? "")}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
        {help}
        {err}
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div>
        {label}
        <select
          id={id}
          className={controlClass}
          value={String(value ?? "")}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          {(field.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {help}
        {err}
      </div>
    );
  }

  if (field.type === "number") {
    return (
      <div>
        {label}
        <input
          id={id}
          type="number"
          className={controlClass}
          placeholder={field.placeholder}
          value={value === undefined || value === null ? "" : String(value)}
          min={field.min}
          max={field.max}
          step={field.step}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        />
        {help}
        {err}
      </div>
    );
  }

  return (
    <div>
      {label}
      <input
        id={id}
        type="text"
        className={controlClass}
        placeholder={field.placeholder}
        value={String(value ?? "")}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      {help}
      {err}
    </div>
  );
}

export function useToolForm(tool: SlabAITool) {
  const defaults = useMemo(() => buildDefaultFormValues(tool), [tool]);
  const [values, setValues] = useState<Record<string, unknown>>(defaults);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setValues(buildDefaultFormValues(tool));
    setErrors({});
  }, [tool]);

  function reset() {
    setValues(buildDefaultFormValues(tool));
    setErrors({});
  }

  function validate(): boolean {
    const parsed = tool.formSchema.safeParse(values);
    if (parsed.success) {
      setErrors({});
      setValues(parsed.data);
      return true;
    }
    const next: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "_");
      if (!next[key]) next[key] = issue.message;
    }
    setErrors(next);
    return false;
  }

  return { values, setValues, errors, setErrors, reset, validate };
}
