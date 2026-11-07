import { normalizeHandle } from "@lustre/block-queue/queue";
import { useId, useState } from "react";
import { DEFAULT_SETTINGS, type Settings, settingsItem } from "@/lib/storage";
import { fieldClass, Heading, inputClass, Toggle } from "./ui";
import { useStorageItem } from "./use-storage-item";

const useSettings = () => {
  const stored = useStorageItem(settingsItem);
  const settings: Settings = { ...DEFAULT_SETTINGS, ...stored };
  const update = (patch: Partial<Settings>) =>
    settingsItem.setValue({ ...settings, ...patch });
  return [settings, update] as const;
};

export const SettingsTab = () => {
  const [settings, update] = useSettings();
  const [allowlist, setAllowlist] = useState<string>();
  const allowlistId = useId();
  const delayId = useId();

  const saveAllowlist = () => {
    if (allowlist === undefined) {
      return;
    }
    const handles = allowlist
      .split(/[\s,]+/)
      .map(normalizeHandle)
      .filter(Boolean);
    update({ allowlist: [...new Set(handles)] });
    setAllowlist(undefined);
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <Heading>Buttons on posts</Heading>
        <Toggle
          checked={settings.showBlockButton}
          icon="pollice"
          label="Block"
          onChange={(showBlockButton) => update({ showBlockButton })}
        />
        <Toggle
          checked={settings.showMuteButton}
          icon="tacita"
          label="Mute"
          onChange={(showMuteButton) => update({ showMuteButton })}
        />
        <Toggle
          checked={settings.showNotInterestedButton}
          hint="X offers it on the For you timeline"
          icon="aversio"
          label="Not interested"
          onChange={(showNotInterestedButton) =>
            update({ showNotInterestedButton })
          }
        />
        <Toggle
          checked={settings.hideAfterAction}
          label="Hide the post after an action"
          onChange={(hideAfterAction) => update({ hideAfterAction })}
        />
      </section>
      <section className="flex flex-col gap-3">
        <Heading>Blocking</Heading>
        <Toggle
          checked={settings.skipFollowing}
          label="Skip accounts I follow"
          onChange={(skipFollowing) => update({ skipFollowing })}
        />
        <Toggle
          checked={settings.autoStartAfterImport}
          label="Start blocking after an import"
          onChange={(autoStartAfterImport) => update({ autoStartAfterImport })}
        />
        <label
          className="flex items-center justify-between gap-4 text-sm"
          htmlFor={delayId}
        >
          Seconds between blocks
          <input
            className={`${fieldClass} w-16 py-1 text-right tabular-nums`}
            id={delayId}
            max={30}
            min={1}
            onChange={(event) =>
              update({
                blockDelayMs: Math.max(1, Number(event.target.value)) * 1000,
              })
            }
            step={0.5}
            type="number"
            value={settings.blockDelayMs / 1000}
          />
        </label>
        <label className="flex flex-col gap-2 text-sm" htmlFor={allowlistId}>
          Never block
          <textarea
            className={`${inputClass} resize-y`}
            id={allowlistId}
            onBlur={saveAllowlist}
            onChange={(event) => setAllowlist(event.target.value)}
            placeholder="@handle, @handle"
            rows={2}
            value={
              allowlist ??
              settings.allowlist.map((handle) => `@${handle}`).join(", ")
            }
          />
        </label>
      </section>
    </div>
  );
};
