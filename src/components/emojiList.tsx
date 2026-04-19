import { createStore, SetStoreFunction, Store } from "solid-js/store";
import { onCleanup } from "solid-js";
import { Slack } from "../lib/slacktism";
import { StateType } from "../views";

type Props = {
  state: Store<StateType>;
  setState: SetStoreFunction<StateType>;
  close: () => void;
};

export default function EmojiList(props: Props) {
  const [state, setState] = createStore<{
    activeTab: "emoji" | "gifs";
  }>({
    activeTab: "emoji",
  });

  let closeRef: HTMLDivElement | undefined;

  const handleClickOutside = (e: MouseEvent) => {
    if (closeRef && !closeRef.contains(e.target as Node)) {
      props.close();
    }
  };

  document.addEventListener("mousedown", handleClickOutside);
  onCleanup(() =>
    document.removeEventListener("mousedown", handleClickOutside),
  );

  return (
    <div
      ref={closeRef}
      class="z-50 h-96 w-80 bg-ctp-surface0 box-border border rounded shadow-lg relative"
    >
      <div class="top-0 left-0 w-full flex">
        <button
          class={`flex-1 h-12 text-center relative hover:cursor-pointer ${state.activeTab === "emoji" ? "border-b-4 border-white" : ""}`}
          onClick={() => setState({ activeTab: "emoji" })}
        >
          Emoji

        </button>
        <button
          class={`flex-1 h-12 text-center relative hover:cursor-pointer ${state.activeTab === "gifs" ? "border-b-4 border-white" : ""}`}
          onClick={() => setState({ activeTab: "gifs" })}
        >
          GIFs
        </button>
      </div>
      <div class="px-2 py-2">
        <input
          placeholder="Search through all emojis"
          class="px-2 py-1 w-full border-[0.01px] border-white rounded"
        />
      </div>
    </div>
  );
}
