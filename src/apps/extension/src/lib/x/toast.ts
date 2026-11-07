const TOAST_MS = 5000;

let current: { element: HTMLElement; timer: number } | undefined;

const dismiss = () => {
  if (!current) {
    return;
  }
  window.clearTimeout(current.timer);
  current.element.remove();
  current = undefined;
};

export type ToastAction = { label: string; run: () => void | Promise<void> };

/** Shows one short message at the bottom of the page, with an optional action. */
export const showToast = (
  text: string,
  options: { action?: ToastAction; tone?: "info" | "error" } = {}
) => {
  dismiss();
  const element = document.createElement("div");
  element.className = `lustre-toast lustre-toast-${options.tone ?? "info"}`;
  element.setAttribute("role", "status");
  const label = document.createElement("span");
  label.textContent = text;
  element.append(label);
  if (options.action) {
    const { action } = options;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = action.label;
    button.addEventListener("click", async () => {
      dismiss();
      await action.run();
    });
    element.append(button);
  }
  document.body.append(element);
  current = { element, timer: window.setTimeout(dismiss, TOAST_MS) };
};
