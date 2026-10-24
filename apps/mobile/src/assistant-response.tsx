import { useCallback, useState } from "react";
import { Image, Linking, Pressable, Text, type TextStyle, View } from "react-native";
import Markdown, { type MarkdownStyles, type RenderRules } from "react-native-markdown-renderer";
import { assistantMarkdown, isSafeAssistantUrl } from "./assistant-markdown";
import { colors, ErrorNotice } from "./ui";

const textStyle = { color: colors.text, fontSize: 16, lineHeight: 24 };
const style: Partial<MarkdownStyles> = {
  text: textStyle,
  paragraph: { marginTop: 0, marginBottom: 6 },
  list: { marginBottom: 6 },
  headingContainer: { marginTop: 8, marginBottom: 4 },
  heading1: { fontSize: 21, lineHeight: 27 },
  heading2: { fontSize: 19, lineHeight: 25 },
  heading3: { fontSize: 17, lineHeight: 23 },
  link: { color: colors.blueDark, textDecorationLine: "underline" },
  codeInline: { backgroundColor: "#E2E4E7", color: colors.text },
  codeBlock: { backgroundColor: "#E2E4E7", color: colors.text },
};
const renderCodeBlock: RenderRules["fence"] = (node, _children, _parent, styles) => (
  <Text key={node.key} selectable style={styles.codeBlock as TextStyle}>
    {node.content.replace(/\n$/, "")}
  </Text>
);

const imageUrlPattern = /\.(png|jpe?g|webp|gif|avif)(\?[^\s]*)?$/i;
const maxImageWidth = 320;
const maxImageHeight = 420;

function InlineImage({ src, alt }: { src: string; alt?: string }) {
  const [aspect, setAspect] = useState(4 / 3);
  const [failed, setFailed] = useState(false);
  if (failed || !isSafeAssistantUrl(src)) {
    return (
      <Text selectable style={{ color: colors.muted }}>
        {alt ? `[Image: ${alt}]` : "[Image]"}
      </Text>
    );
  }
  let width = maxImageWidth;
  let height = Math.round(width / aspect);
  if (height > maxImageHeight) {
    height = maxImageHeight;
    width = Math.round(height * aspect);
  }
  return (
    <View style={{ marginVertical: 6 }}>
      <Pressable
        onPress={() => void Linking.openURL(src).catch(() => undefined)}
        accessibilityRole="link"
        accessibilityLabel={alt ? `Open full-size image: ${alt}` : "Open full-size image"}
      >
        <Image
          source={{ uri: src }}
          style={{ width, height, borderRadius: 8, backgroundColor: "#E2E4E7" }}
          resizeMode="cover"
          onLoad={(event) => {
            const source = event.nativeEvent.source;
            if (source?.width && source?.height) setAspect(source.width / source.height);
          }}
          onError={() => setFailed(true)}
        />
      </Pressable>
      {alt ? (
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 4 }}>
          {alt}
        </Text>
      ) : null}
    </View>
  );
}

export function AssistantResponse({ content }: { content: string }) {
  const [linkError, setLinkError] = useState("");
  const onLinkPress = useCallback((url: string) => {
    if (!isSafeAssistantUrl(url)) return false;
    setLinkError("");
    void Linking.openURL(url).catch((error) =>
      setLinkError(error instanceof Error ? error.message : String(error)),
    );
    return false;
  }, []);
  const rules: RenderRules = {
    textgroup: (node, children) => (
      <Text key={node.key} selectable style={textStyle}>
        {children}
      </Text>
    ),
    image: (node) => (
      <InlineImage key={node.key} src={node.attributes.src ?? ""} alt={node.attributes.alt} />
    ),
    link: (node, children, _parent, styles) => {
      const href = node.attributes.href ?? "";
      if (imageUrlPattern.test(href)) {
        return <InlineImage key={node.key} src={href} />;
      }
      return (
        <Text key={node.key} style={styles.link as TextStyle} onPress={() => onLinkPress(href)}>
          {children}
        </Text>
      );
    },
    code_block: renderCodeBlock,
    fence: renderCodeBlock,
  };
  return (
    <>
      <Markdown
        markdownit={assistantMarkdown}
        style={style}
        rules={rules}
        onLinkPress={onLinkPress}
      >
        {content}
      </Markdown>
      <ErrorNotice error={linkError} />
    </>
  );
}
