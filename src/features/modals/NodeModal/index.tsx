import React, { useEffect, useState } from "react";
import type { ModalProps } from "@mantine/core";
import { Modal, Stack, Text, ScrollArea, Flex, CloseButton } from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import type { NodeData } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";
import useJson from "../../../store/useJson"; // <-- existing json store
import useFile from "../../../store/useFile"; // <-- added file store

// return object from json removing array and object fields
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";
  if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

  const obj: Record<string, any> = {};
  nodeRows.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return "{}";
  }
};

// return json path in the format $["customer"][0]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

export const NodeModal = ({ opened, onClose }: ModalProps) => {
  const nodeData = useGraph(state => state.selectedNode);

  // useJson provides getJson() and setJson(...)
  const getJson = useJson(state => state.getJson);
  const setJson = useJson(state => state.setJson);

  // useFile setContents updates the left-side editor
  const setContents = useFile(state => state.setContents);

  // component-local editing state
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState<string>(() => normalizeNodeData(nodeData?.text ?? []));
  const [parseError, setParseError] = useState<string | null>(null);

  // Sync textarea when selected node changes or modal opens
  useEffect(() => {
    setTempValue(normalizeNodeData(nodeData?.text ?? []));
    setIsEditing(false);
    setParseError(null);
  }, [nodeData?.path, opened]);

  const handleSave = () => {
    try {
      const parsed = JSON.parse(tempValue);

      // If no node path, replace the root JSON
      if (!nodeData?.path || nodeData.path.length === 0) {
        const formatted = JSON.stringify(parsed, null, 2);
        setJson(formatted);
        setContents({ contents: formatted });
      } else {
        // Merge into the current global JSON at the node path
        const currentJsonStr = getJson();
        let current: any;
        try {
          current = JSON.parse(currentJsonStr);
        } catch {
          // If current global JSON is invalid, replace it with the edited value
          const formatted = JSON.stringify(parsed, null, 2);
          setJson(formatted);
          setContents({ contents: formatted });
          setIsEditing(false);
          setParseError(null);
          return;
        }

        // Walk the path and set the value (mutating current - fine for this usage)
        let cursor: any = current;
        const path = nodeData.path;
        for (let i = 0; i < path.length; i++) {
          const key = path[i];
          const isLast = i === path.length - 1;

          if (isLast) {
            cursor[key as any] = parsed;
          } else {
            // Ensure intermediate containers exist
            const nextKey = path[i + 1];
            if (typeof key === "number") {
              if (!Array.isArray(cursor[key as any])) cursor[key as any] = typeof nextKey === "number" ? [] : {};
            } else {
              if (cursor[key as any] === undefined || cursor[key as any] === null) {
                cursor[key as any] = typeof nextKey === "number" ? [] : {};
              }
            }
            cursor = cursor[key as any];
          }
        }

        const formatted = JSON.stringify(current, null, 2);
        setJson(formatted);
        setContents({ contents: formatted });
      }

      setIsEditing(false);
      setParseError(null);
    } catch (err: any) {
      setParseError(err?.message ?? "Invalid JSON");
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setTempValue(normalizeNodeData(nodeData?.text ?? []));
    setParseError(null);
  };

  return (
    <Modal size="auto" opened={opened} onClose={onClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        <Stack gap="xs">
          <Flex justify="space-between" align="center">
            <Text fz="xs" fw={500}>
              Content
            </Text>
            <CloseButton onClick={onClose} />
          </Flex>

          <ScrollArea.Autosize mah={250} maw={600}>
            {!isEditing ? (
              <>
                <CodeHighlight
                  code={normalizeNodeData(nodeData?.text ?? [])}
                  miw={350}
                  maw={600}
                  language="json"
                  withCopyButton
                />
                <button onClick={() => setIsEditing(true)}>Edit</button>
              </>
            ) : (
              <>
                <textarea
                  value={tempValue}
                  onChange={(e) => setTempValue(e.target.value)}
                  style={{ width: "100%", height: 200, fontFamily: "monospace" }}
                />
                {parseError && <Text fz="xs" color="red">{parseError}</Text>}
                <Flex gap="sm" mt="sm">
                  <button onClick={handleSave}>Save</button>
                  <button onClick={handleCancel}>Cancel</button>
                </Flex>
              </>
            )}
          </ScrollArea.Autosize>
        </Stack>

        <Text fz="xs" fw={500}>
          JSON Path
        </Text>
        <ScrollArea.Autosize maw={600}>
          <CodeHighlight
            code={jsonPathToString(nodeData?.path)}
            miw={350}
            mah={250}
            language="json"
            copyLabel="Copy to clipboard"
            copiedLabel="Copied to clipboard"
            withCopyButton
          />
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  );
};