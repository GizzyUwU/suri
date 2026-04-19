import {
  Block,
  HeaderBlock,
  RichTextBlock,
  RichTextElement,
} from "@slack/web-api";
import type { Slack } from "./slacktism";
import { parseMarkdownToSlackBlocks } from "./parseMrkdwn";
import { JSX } from "solid-js";

type EntityContext = {
  resolveUser?: (id: string) => string;
  resolveChannel?: (id: string) => string;
};

function decodeSlackText(text: string) {
  if (!text) return "";
  let decoded = text
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
  decoded = decoded.replace(/\\([_*~`>])/g, "$1");
  return decoded;
}

function renderSlackInlineJSX(
  text: string,
  ctx: EntityContext,
  style?: any,
): JSX.Element[] {
  const wrapWithStyle = (content: JSX.Element, style: any): JSX.Element => {
    let el: JSX.Element = content;
    if (!style) return el;
    if (style.code) el = <code>{el}</code>;
    if (style.bold) el = <b>{el}</b>;
    if (style.italic) el = <i>{el}</i>;
    if (style.underline) el = <u>{el}</u>;
    if (style.strike) el = <s>{el}</s>;
    if (style.code)
      el = (
        <pre
          class="
      mt-2
      border
    border-gray-300/13
    bg-black/20
    text-orange-700
      rounded
      px-0.75
      py-0.5
      text-[12px]
      leading-normal
      font-mono
      whitespace-pre-wrap
      wrap-break-word
      tab-size-4"
        >
          <code>{el}</code>
        </pre>
      );
    return el;
  };

  const decoded = decodeSlackText(text);
  const parts: JSX.Element[] = [];
  const regex = /<([^>]+)>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(decoded)) !== null) {
    if (match.index > lastIndex)
      parts.push(wrapWithStyle(decoded.slice(lastIndex, match.index), style));

    const inner = match[1];
    let jsxPart: JSX.Element;

    if (inner.startsWith("@")) {
      const id = inner.slice(1);
      jsxPart = (
        <span class="slack-mention user" data-user-id={id}>
          @{ctx.resolveUser?.(id) ?? id}
        </span>
      );
    } else if (inner.startsWith("#")) {
      const [id, name] = inner.slice(1).split("|");
      jsxPart = (
        <span class="slack-mention channel" data-channel-id={id}>
          #{name ?? ctx.resolveChannel?.(id) ?? id}
        </span>
      );
    } else if (inner.startsWith("http")) {
      const [url, label] = inner.split("|");
      jsxPart = (
        <a href={url} target="_blank" rel="noopener noreferrer">
          {label ?? url}
        </a>
      );
    } else {
      jsxPart = wrapWithStyle(`<${inner}>`, style);
    }

    parts.push(jsxPart);
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < decoded.length)
    parts.push(wrapWithStyle(decoded.slice(lastIndex), style));

  const finalElements: JSX.Element[] = [];
  for (const part of parts) {
    if (typeof part === "string") {
      const lines = part.split("\n");
      lines.forEach((line, idx) => {
        finalElements.push(line);
        if (idx < lines.length - 1)
          finalElements.push(<span class="block mt-2"></span>);
      });
    } else {
      finalElements.push(part);
    }
  }

  return finalElements;
}

function richTextParser(
  block: RichTextBlock,
  ctx: EntityContext,
): JSX.Element[] {
  const elements: JSX.Element[] = [];

  for (const el of block.elements ?? []) {
    switch (el.type) {
      case "rich_text_section": {
        const sectionElements: JSX.Element[] = [];
        for (const node of el.elements ?? []) {
          if (node.type === "text")
            sectionElements.push(
              ...renderSlackInlineJSX(node.text, ctx, node.style),
            );
          else if (node.type === "link")
            sectionElements.push(
              <a
                href={node.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ "text-decoration": "underline" }}
                class="text-ctp-blue"
              >
                {node.text ?? node.url}
              </a>,
            );
          else if (node.type === "user")
            sectionElements.push(
              <span class="slack-mention user" data-user-id={node.user_id}>
                @{ctx.resolveUser?.(node.user_id) ?? node.user_id}
              </span>,
            );
          else if (node.type === "emoji")
            sectionElements.push(`:${node.name}:`);
        }

        const isWhitespaceOnly = sectionElements.every(
          (e) => typeof e === "string" && e.trim() === "",
        );

        if (isWhitespaceOnly) {
          elements.push(<br />);
        } else {
          elements.push(...sectionElements);
          elements.push(<br />);
        }
        break;
      }

      case "rich_text_quote":
        elements.push(
          <blockquote
            style={{
              "border-left": "lightgray 6px solid",
              "border-top-left-radius": "1px",
              "border-bottom-left-radius": "1px",
            }}
          >
            <div
              style={{
                "padding-left": "4px",
              }}
            >
              {el.elements?.flatMap((n: RichTextElement) =>
                n.type === "text" ? renderSlackInlineJSX(n.text, ctx) : [],
              )}
            </div>
          </blockquote>,
        );
        break;

      case "rich_text_preformatted":
        elements.push(
          <pre
            class="
              border
            border-gray-300/13
            bg-black/20
            text-orange-700
              rounded
              px-2
              py-2
              w-full
              text-[12px]
              leading-normal
              font-mono
              whitespace-pre-wrap
              wrap-break-word
              "
          >
            <code>
              {el.elements?.flatMap((n: RichTextElement) =>
                n.type === "text" ? renderSlackInlineJSX(n.text, ctx) : [],
              )}
            </code>
          </pre>,
        );
        break;

      case "rich_text_list":
        if (el.style === "ordered") {
          elements.push(
            <div style={{ "padding-left": "2px" }}>
              <ol>
                {el.elements?.map((item, index) => (
                  <li>
                    <span>{index + 1}. </span>
                    {item.elements?.flatMap((n) =>
                      n.type === "text"
                        ? renderSlackInlineJSX(n.text, ctx)
                        : [],
                    )}
                  </li>
                ))}
              </ol>
            </div>,
          );
        } else {
          elements.push(
            <div style={{ "padding-left": "2px" }}>
              <ul>
                {el.elements?.map((item) => (
                  <li>
                    -{" "}
                    {item.elements?.flatMap((n) =>
                      n.type === "text"
                        ? renderSlackInlineJSX(n.text, ctx)
                        : [],
                    )}
                  </li>
                ))}
              </ul>
            </div>,
          );
        }
        break;
    }
  }
  return elements;
}

function renderBlock(block: Block, ctx: EntityContext): JSX.Element[] {
  if (block.type === "rich_text") {
    const elements = richTextParser(block as RichTextBlock, ctx);
    return elements;
  } else {
    switch (block.type) {
      case "header": {
        const textElement = (block as HeaderBlock).text;
        if (textElement.type === "plain_text") {
          return [<h1 class="text-xl font-bold">{textElement.text}</h1>];
        }
        return [];
      }
        
      case "section": {
        const sectionBlock = block as any;
        const text = sectionBlock.text;
        if (text?.type === "mrkdwn" && text.text) {
          const richBlocks = parseMarkdownToSlackBlocks(text.text);
          return richBlocks.flatMap((b) =>
            b.type === "rich_text"
              ? richTextParser(b as RichTextBlock, ctx)
              : renderBlock(b as Block, ctx),
          );
        }
        return [];
      }

      default: {
        return [];
      }
    }
  }
}

const deviceWidth = window.innerWidth * window.devicePixelRatio;

function pickSlackThumb(file: any) {
  const thumbs = [
    "thumb_64",
    "thumb_80",
    "thumb_160",
    "thumb_360",
    "thumb_480",
    "thumb_720",
    "thumb_800",
    "thumb_960",
    "thumb_1024",
  ]
    .map((key) => ({
      key,
      url: file[key],
      w: file[`${key}_w`] ?? 0,
      h: file[`${key}_h`] ?? 0,
    }))
    .filter((t) => t.url);

  for (let i = thumbs.length - 1; i >= 0; i--) {
    if (thumbs[i].w <= deviceWidth) return thumbs[i];
  }

  return { url: file.url_private, w: file.original_w, h: file.original_h };
}

export function parseSlackMessageJSX(
  message: { blocks?: Block[]; text?: string; files?: any[] },
  ctx: EntityContext = {},
  client?: Slack,
): JSX.Element[] {
  const content: JSX.Element[] = [];

  if (message.blocks?.length) {
    for (const block of message.blocks)
      content.push(...renderBlock(block, ctx));
  } else if (message.text) {
    content.push(...renderSlackInlineJSX(decodeSlackText(message.text), ctx));
  }

  for (const file of message.files ?? []) {
    if (file.mimetype?.startsWith("image/")) {
      const bestThumb = pickSlackThumb(file);

      content.push(
        <div
          class="slack-file slack-image"
          style={{
            width: "360px",
            "max-width": `${bestThumb.w}px`,
            "max-height": `${bestThumb.h}px`,
            position: "relative",
            "background-color": "#00000020",
          }}
        >
          <img
            data-slack-url={bestThumb.url}
            alt={file.name}
            ref={(el) => {
              if (!el || !client) return;
              // Hide the parent container until image is ready
              const container = el.parentElement as HTMLElement;
              container.style.display = "none";
              
              client
                .getImageDataFromSlack(bestThumb.url)
                .then((blobUrl) => {
                  el.src = blobUrl;
                  el.onload = () => {
                    container.style.display = "";
                  };
                })
                .catch((err) => {
                  console.error("Slack image failed", err);
                  container.style.display = ""; // show anyway on error
                });
            }}
            loading="lazy"
            style={{
              width: "100%",
              height: "auto",
              "object-fit": "contain",
              display: "block",
            }}
            // ref={(el) => {
            //   if (!el || !client) return;
            //   client
            //     .getImageDataFromSlack(bestThumb.url)
            //     .then((blobUrl) => {
            //       el.src = blobUrl;
            //     })
            //     .catch((err) => console.error("Slack image failed", err));
            // }}
          />
        </div>,
      );
    } else {
      content.push(
        <div class="slack-file">
          <a href={file.url_private} target="_blank" rel="noopener noreferrer">
            {file.name}
          </a>
        </div>,
      );
    }
  }

  return content;
}
