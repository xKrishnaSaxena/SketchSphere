import React, {
  useRef,
  useEffect,
  useContext,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import {
  Stage,
  Layer,
  Line,
  Circle,
  Rect,
  Transformer,
  Text,
} from "react-konva";
import { SHAPES, EVENTS } from "../utils/constants";
import { SocketContext } from "../context/SocketContext";
/* Heuristic fallback is now inside the AI service */
import aiShapeRecognition from "../services/aiShapeRecognition";
import Chat from "./Chat";
import jsPDF from "jspdf";

const Whiteboard = forwardRef(
  ({ roomId, users, elements, setElements, currentUser }, ref) => {
    const socket = useContext(SocketContext);
    const stageRef = useRef(null);
    const stageContainerRef = useRef(null);
    const [debugInfo, setDebugInfo] = useState("");
    const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
    const [canvasColor, setCanvasColor] = useState("#ffffff");
    const [pencilSize, setPencilSize] = useState(3);
    const [eraserSize, setEraserSize] = useState(6);
    const [showGrid, setShowGrid] = useState(false);
    const [showCanvasColorPicker, setShowCanvasColorPicker] = useState(false);
    const [showPenColorPicker, setShowPenColorPicker] = useState(false);
    const [selectedColor, setSelectedColor] = useState("#000000");
    const [isDrawing, setIsDrawing] = useState(false);
    const [isErasing, setIsErasing] = useState(false);
    const [showSizeControls, setShowSizeControls] = useState(false);

    const [aiModelLoaded, setAiModelLoaded] = useState(false);

    const [currentTool, setCurrentTool] = useState("pencil"); // 'pencil', 'eraser', 'select', 'text'
    const [selectedId, setSelectedId] = useState(null);
    const transformerRef = useRef(null);
    const [draggedShape, setDraggedShape] = useState(null);
    const [textCursor, setTextCursor] = useState(null);
    const [editingTextId, setEditingTextId] = useState(null);
    const [fontSize, setFontSize] = useState(16);
    const [cursorBlink, setCursorBlink] = useState(true);
    const [textContextMenu, setTextContextMenu] = useState(null);
    const [textFont, setTextFont] = useState("Arial");
    const [textColor, setTextColor] = useState(selectedColor);
    const currentDrawingElementIdRef = useRef(null);
    useImperativeHandle(ref, () => ({
      handleErase: () => {
        setElements([]);
        socket.emit(EVENTS.CLEAR_BOARD, { roomId });
        setDebugInfo("Board cleared");
      },
    }));

    // Export canvas as PDF
    const handleExportPDF = () => {
      if (!stageRef.current) return;

      try {
        const stage = stageRef.current.getStage();
        const dataURL = stage.toDataURL({
          pixelRatio: 2, // Higher quality
          mimeType: "image/png",
          quality: 1,
        });

        // Calculate PDF dimensions (A4 size in mm)
        const pdfWidth = 210; // A4 width in mm
        const pdfHeight = 297; // A4 height in mm

        // Calculate aspect ratio and adjust dimensions
        const canvasAspect = stageSize.width / stageSize.height;
        let imgWidth = pdfWidth;
        let imgHeight = pdfWidth / canvasAspect;

        // If height exceeds A4, scale down
        if (imgHeight > pdfHeight) {
          imgHeight = pdfHeight;
          imgWidth = pdfHeight * canvasAspect;
        }

        // Create PDF (A4 size)
        const pdf = new jsPDF({
          orientation: imgWidth > imgHeight ? "landscape" : "portrait",
          unit: "mm",
          format: "a4",
        });

        // Center the image on the page
        const xOffset = (pdfWidth - imgWidth) / 2;
        const yOffset = (pdfHeight - imgHeight) / 2;

        // Add image to PDF
        pdf.addImage(dataURL, "PNG", xOffset, yOffset, imgWidth, imgHeight);

        // Generate filename with timestamp
        const timestamp = new Date()
          .toISOString()
          .replace(/[:.]/g, "-")
          .slice(0, -5);
        const filename = `sketchsphere-${timestamp}.pdf`;

        // Save PDF
        pdf.save(filename);
        setDebugInfo("PDF exported successfully");
      } catch (error) {
        console.error("Error exporting PDF:", error);
        setDebugInfo("Failed to export PDF");
      }
    };

    // Initialize minimal AI recognizer
    useEffect(() => {
      let mounted = true;
      (async () => {
        try {
          await aiShapeRecognition.initialize();
          if (mounted) {
            setAiModelLoaded(true);
            setDebugInfo("🤖 AI ready");
          }
        } catch (e) {
          console.error("AI init error", e);
          if (mounted) setDebugInfo("AI failed to init");
        }
      })();
      return () => {
        mounted = false;
      };
    }, []);

    useEffect(() => {
      if (textCursor) {
        const blinkInterval = setInterval(() => {
          setCursorBlink((prev) => !prev);
        }, 530);
        return () => clearInterval(blinkInterval);
      } else {
        setCursorBlink(true);
      }
    }, [textCursor]);

    useEffect(() => {
      const handleKeyDown = (e) => {
        if (!textCursor) return;

        if (e.key === "ArrowUp" && !textContextMenu) {
          e.preventDefault();
          const containerRect =
            stageContainerRef.current?.getBoundingClientRect();
          if (containerRect) {
            setTextContextMenu({
              x: containerRect.left + textCursor.x + 100,
              y: containerRect.top + textCursor.y + 50,
            });
          }
          return;
        }

        if (e.key === "Escape") {
          setTextCursor(null);
          setEditingTextId(null);
          setTextContextMenu(null);
          return;
        }

        if (e.key === "Enter") {
          if (editingTextId) {
            const element = elements.find((el) => el.id === editingTextId);
            if (element && element.text) {
              setElements((prev) =>
                prev.map((el) =>
                  el.id === editingTextId
                    ? {
                        ...el,
                        text: element.text,
                        fontFamily: textFont,
                        color: textColor,
                        fontSize: fontSize,
                      }
                    : el
                )
              );
              socket.emit(EVENTS.SHAPE_UPDATE, {
                roomId,
                elementId: editingTextId,
                updatedAttrs: {
                  text: element.text,
                  fontFamily: textFont,
                  color: textColor,
                  fontSize: fontSize,
                },
                userId: currentUser?.id,
              });
            }
          } else if (textCursor.text && textCursor.text.trim()) {
            const textWidth = textCursor.text.length * (fontSize * 0.6);
            const textHeight = fontSize * 1.2;
            const newTextElement = {
              id: Date.now(),
              type: "text",
              x: textCursor.x,
              y: textCursor.y,
              text: textCursor.text,
              fontSize,
              fontFamily: textFont,
              color: textColor,
              shapeId: textCursor.shapeId || null,
              width: textWidth,
              height: textHeight,
            };
            setElements((prev) => [...prev, newTextElement]);
            socket.emit(EVENTS.DRAW_START, {
              roomId,
              element: newTextElement,
              userId: currentUser?.id,
            });
            setDebugInfo(`Text added: "${textCursor.text}"`);
          }
          setTextCursor(null);
          setEditingTextId(null);
          return;
        }

        if (e.key === "Backspace") {
          if (editingTextId) {
            const element = elements.find((el) => el.id === editingTextId);
            if (element) {
              const newText = (element.text || "").slice(0, -1);
              setElements((prev) =>
                prev.map((el) =>
                  el.id === editingTextId
                    ? {
                        ...el,
                        text: newText,
                        fontFamily: textFont,
                        color: textColor,
                        fontSize: fontSize,
                      }
                    : el
                )
              );
            }
          } else if (textCursor.text) {
            setTextCursor((prev) => ({
              ...prev,
              text: prev.text.slice(0, -1),
            }));
          }
          return;
        }

        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          if (editingTextId) {
            const element = elements.find((el) => el.id === editingTextId);
            if (element) {
              const newText = (element.text || "") + e.key;
              setElements((prev) =>
                prev.map((el) =>
                  el.id === editingTextId ? { ...el, text: newText } : el
                )
              );
            }
          } else {
            setTextCursor((prev) => ({
              ...prev,
              text: (prev.text || "") + e.key,
            }));
          }
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [
      textCursor,
      editingTextId,
      elements,
      fontSize,
      selectedColor,
      socket,
      roomId,
      textContextMenu,
      textFont,
      textColor,
    ]);

    useEffect(() => {
      if (!selectedId || currentTool !== "select") {
        transformerRef.current.nodes([]);
        return;
      }
      const stage = stageRef.current;
      const selectedNode = stage.findOne(`.${selectedId}`);
      if (selectedNode) {
        const element = elements.find((el) => el.id === selectedId);
        if (element) {
          if (element.type === "text") {
            transformerRef.current.keepRatio(false);
            transformerRef.current.enabledAnchors([
              "top-left",
              "top-right",
              "bottom-left",
              "bottom-right",
              "top-center",
              "bottom-center",
              "middle-left",
              "middle-right",
            ]);
            transformerRef.current.borderEnabled(true);
            transformerRef.current.resizeEnabled(true);
          } else {
            const keepRatio = [
              "circle",
              "square",
              "triangle",
              "hexagon",
              "pentagon",
            ].includes(element.type);
            transformerRef.current.keepRatio(keepRatio);
            transformerRef.current.enabledAnchors(
              keepRatio
                ? ["top-left", "top-right", "bottom-left", "bottom-right"]
                : undefined
            );
          }
        }
        transformerRef.current.nodes([selectedNode]);
        transformerRef.current.getLayer().batchDraw();
      }
    }, [selectedId, currentTool, elements]);

    useEffect(() => {
      const tr = transformerRef.current;
      if (tr) {
        tr.on("transformend", () => {
          const node = tr.nodes()[0];
          if (!node) return;
          const className = node.getClassName();
          const element = elements.find((el) => el.id === selectedId);
          if (!element) return;

          let updatedAttrs = {
            rotation: node.rotation(),
          };

          if (className === "Rect") {
            // For rectangle and square
            const newWidth = node.width() * node.scaleX();
            const newHeight = node.height() * node.scaleY();
            updatedAttrs = {
              ...updatedAttrs,
              x: node.x(),
              y: node.y(),
            };
            if (element.type === "square") {
              // Average for safety, though keepRatio should make them equal
              const newSide = (newWidth + newHeight) / 2;
              updatedAttrs.side = newSide;
            } else {
              updatedAttrs.width = newWidth;
              updatedAttrs.height = newHeight;
            }
          } else if (className === "Circle") {
            const scaleAvg = (node.scaleX() + node.scaleY()) / 2;
            updatedAttrs = {
              ...updatedAttrs,
              x: node.x(),
              y: node.y(),
              radius: node.radius() * scaleAvg,
            };
          } else if (className === "Text") {
            const scaleX = node.scaleX();
            const scaleY = node.scaleY();
            const avgScale = (scaleX + scaleY) / 2;
            const currentFontSize = element.fontSize || fontSize;
            const newFontSize = Math.max(
              12,
              Math.min(200, currentFontSize * avgScale)
            );
            const currentWidth =
              element.width ||
              (element.text?.length || 0) * (currentFontSize * 0.6);
            const currentHeight = element.height || currentFontSize * 1.2;
            const newWidth = currentWidth * scaleX;
            const newHeight = currentHeight * scaleY;
            updatedAttrs = {
              ...updatedAttrs,
              x: node.x(),
              y: node.y(),
              fontSize: newFontSize,
              width: newWidth,
              height: newHeight,
            };
            node.scaleX(1);
            node.scaleY(1);
          } else if (className === "Line") {
            // For line, freehand, eraser, triangle, hexagon, pentagon
            const originalPoints = node.points();
            // Guard against undefined or invalid points
            if (
              !originalPoints ||
              !Array.isArray(originalPoints) ||
              originalPoints.length === 0
            ) {
              return;
            }

            const shouldKeepRatio = [
              "circle",
              "square",
              "triangle",
              "hexagon",
              "pentagon",
            ].includes(element.type);
            const isRegularShape = ["triangle", "hexagon", "pentagon"].includes(
              element.type
            );

            if (isRegularShape && shouldKeepRatio) {
              // For regular shapes, apply uniform scaling from centroid of points
              const uniformScale = Math.max(
                Math.abs(node.scaleX()),
                Math.abs(node.scaleY())
              );
              let sumX = 0,
                sumY = 0,
                count = 0;
              for (let i = 0; i < originalPoints.length; i += 2) {
                if (
                  originalPoints[i] !== undefined &&
                  originalPoints[i + 1] !== undefined
                ) {
                  sumX += originalPoints[i];
                  sumY += originalPoints[i + 1];
                  count++;
                }
              }
              const centerX = count > 0 ? sumX / count : 0;
              const centerY = count > 0 ? sumY / count : 0;
              const newPoints = [];
              for (let i = 0; i < originalPoints.length; i += 2) {
                if (
                  originalPoints[i] !== undefined &&
                  originalPoints[i + 1] !== undefined
                ) {
                  const dx = originalPoints[i] - centerX;
                  const dy = originalPoints[i + 1] - centerY;
                  newPoints.push(
                    centerX + dx * uniformScale,
                    centerY + dy * uniformScale
                  );
                }
              }
              updatedAttrs = {
                ...updatedAttrs,
                points: newPoints,
                x: 0,
                y: 0,
                rotation: 0,
              };
            } else {
              // For lines and other shapes, use normal transform
              const transform = node.getTransform();
              const newPoints = [];
              for (let i = 0; i < originalPoints.length; i += 2) {
                if (
                  originalPoints[i] !== undefined &&
                  originalPoints[i + 1] !== undefined
                ) {
                  const pt = transform.point({
                    x: originalPoints[i],
                    y: originalPoints[i + 1],
                  });
                  newPoints.push(pt.x, pt.y);
                }
              }
              updatedAttrs = {
                ...updatedAttrs,
                points: newPoints,
                x: 0,
                y: 0,
                rotation: 0,
              };
            }
          }

          setElements((prev) =>
            prev.map((el) =>
              el.id === selectedId ? { ...el, ...updatedAttrs } : el
            )
          );
          socket.emit(EVENTS.SHAPE_UPDATE, {
            roomId,
            elementId: selectedId,
            updatedAttrs,
            userId: currentUser?.id,
          });
          // Reset node transforms
          node.scaleX(1);
          node.scaleY(1);
          if (className === "Line") {
            node.x(0);
            node.y(0);
            node.rotation(0);
          }
        });
      }
    }, [elements, socket, roomId]);
    // Update stage size on mount and window resize
    useEffect(() => {
      const updateStageSize = () => {
        const containerEl =
          stageContainerRef.current || stageRef.current?.container();
        if (containerEl) {
          const rect = containerEl.getBoundingClientRect();
          setStageSize({
            width: rect.width,
            height: rect.height,
          });
        }
      };

      updateStageSize();
      window.addEventListener("resize", updateStageSize);
      return () => window.removeEventListener("resize", updateStageSize);
    }, []);

    // Socket listeners
    useEffect(() => {
      if (!socket || !roomId) return;

      const handleRemoteDrawStart = (element) => {
        // Only add if it's from another user (or if currentUser is not set yet, accept all)
        const isFromOtherUser =
          !currentUser || (element.userId && element.userId !== currentUser.id);
        if (isFromOtherUser) {
          console.log("Remote DRAW_START received:", element);
          setElements((prev) => {
            // Check if element already exists to avoid duplicates
            if (prev.find((el) => el.id === element.id)) {
              return prev;
            }
            return [...prev, element];
          });
        }
      };

      const handleRemoteDrawMove = (data) => {
        // data should have { elementId, point, userId }
        if (!data.elementId || !data.point) return;

        // Skip if it's from current user
        if (currentUser && data.userId === currentUser.id) return;

        console.log("Remote DRAW_MOVE received:", data);
        setElements((prev) => {
          const elementIndex = prev.findIndex((el) => el.id === data.elementId);
          if (elementIndex === -1) return prev;

          const updated = [...prev];
          const element = updated[elementIndex];
          if (
            element &&
            (element.type === SHAPES.FREEHAND || element.type === SHAPES.ERASER)
          ) {
            // data.point is already [x, y], and element.points is [[x, y], [x, y], ...]
            // So we just need to append data.point to the points array
            const currentPoints = Array.isArray(element.points)
              ? element.points
              : [];
            updated[elementIndex] = {
              ...element,
              points: [...currentPoints, data.point],
            };
          }
          return updated;
        });
      };

      const handleRemoteDrawEnd = (data) => {
        // Handle draw end if needed
        if (!currentUser || (data.userId && data.userId !== currentUser.id)) {
          console.log("Remote DRAW_END received:", data);
          setDebugInfo("Remote drawing completed");
        }
      };

      const handleShapeUpdate = (data) => {
        // Handle shape updates from other users (like AI shape recognition)
        if (!currentUser || (data.userId && data.userId !== currentUser.id)) {
          console.log("Remote SHAPE_UPDATE received:", data);
          setElements((prev) => {
            const elementIndex = prev.findIndex(
              (el) => el.id === data.elementId
            );
            if (elementIndex === -1) {
              // Element doesn't exist yet, might be a new shape recognition
              // This shouldn't happen, but handle it gracefully
              console.warn(
                "Shape update received for non-existent element:",
                data.elementId
              );
              return prev;
            }

            const existingElement = prev[elementIndex];
            const updated = [...prev];

            // If the type is changing (e.g., from freehand to circle), completely replace the element
            // This is important for AI shape recognition which changes the entire element structure
            if (
              data.updatedAttrs.type &&
              data.updatedAttrs.type !== existingElement.type
            ) {
              // Complete replacement for shape recognition
              // Create a new element with all properties from updatedAttrs, preserving id and ensuring color/strokeWidth
              const newElement = {
                id: existingElement.id,
                ...data.updatedAttrs,
                // Ensure color and strokeWidth are set (use updatedAttrs if provided, otherwise keep existing)
                color:
                  data.updatedAttrs.color !== undefined
                    ? data.updatedAttrs.color
                    : existingElement.color,
                strokeWidth:
                  data.updatedAttrs.strokeWidth !== undefined
                    ? data.updatedAttrs.strokeWidth
                    : existingElement.strokeWidth,
              };

              // Remove properties that shouldn't exist for the new shape type
              if (newElement.type === "circle") {
                // Circle uses x, y, radius - remove points, width, height, side
                delete newElement.points;
                delete newElement.width;
                delete newElement.height;
                delete newElement.side;
              } else if (newElement.type === "rectangle") {
                // Rectangle uses x, y, width, height - remove points, radius, side
                delete newElement.points;
                delete newElement.radius;
                delete newElement.side;
              } else if (newElement.type === "square") {
                // Square uses x, y, side - remove points, radius, width, height
                delete newElement.points;
                delete newElement.radius;
                delete newElement.width;
                delete newElement.height;
              } else if (
                newElement.type === "triangle" ||
                newElement.type === "hexagon" ||
                newElement.type === "pentagon" ||
                newElement.type === "line"
              ) {
                // These use points - remove other shape properties
                delete newElement.radius;
                delete newElement.width;
                delete newElement.height;
                delete newElement.side;
              }

              console.log(
                "Shape type changed from",
                existingElement.type,
                "to",
                newElement.type,
                ":",
                newElement
              );
              updated[elementIndex] = newElement;
            } else {
              // Partial update (like transform, color change, etc.)
              updated[elementIndex] = {
                ...existingElement,
                ...data.updatedAttrs,
              };
            }

            return updated;
          });
        }
      };

      const handleClearBoard = () => {
        console.log("Remote CLEAR_BOARD received");
        setElements([]);
        setDebugInfo("Board cleared by another user");
      };

      socket.on(EVENTS.DRAW_START, handleRemoteDrawStart);
      socket.on(EVENTS.DRAW_MOVE, handleRemoteDrawMove);
      socket.on(EVENTS.DRAW_END, handleRemoteDrawEnd);
      socket.on(EVENTS.SHAPE_UPDATE, handleShapeUpdate);
      socket.on(EVENTS.CLEAR_BOARD, handleClearBoard);

      return () => {
        socket.off(EVENTS.DRAW_START, handleRemoteDrawStart);
        socket.off(EVENTS.DRAW_MOVE, handleRemoteDrawMove);
        socket.off(EVENTS.DRAW_END, handleRemoteDrawEnd);
        socket.off(EVENTS.SHAPE_UPDATE, handleShapeUpdate);
        socket.off(EVENTS.CLEAR_BOARD, handleClearBoard);
      };
    }, [setElements, socket, roomId, currentUser]);

    const handleShapeDrop = (shapeType, x, y) => {
      const baseSize = 120;
      let newElement;

      const centerX = x;
      const centerY = y;

      switch (shapeType) {
        case "circle":
          newElement = {
            id: Date.now(),
            type: "circle",
            x: centerX,
            y: centerY,
            radius: baseSize / 2,
            color: selectedColor,
            strokeWidth: pencilSize,
          };
          break;
        case "square":
          newElement = {
            id: Date.now(),
            type: "square",
            x: centerX - baseSize / 2,
            y: centerY - baseSize / 2,
            side: baseSize,
            color: selectedColor,
            strokeWidth: pencilSize,
          };
          break;
        case "rectangle":
          newElement = {
            id: Date.now(),
            type: "rectangle",
            x: centerX - baseSize,
            y: centerY - baseSize / 2,
            width: baseSize * 2,
            height: baseSize,
            color: selectedColor,
            strokeWidth: pencilSize,
          };
          break;
        case "triangle":
          newElement = {
            id: Date.now(),
            type: "triangle",
            points: [
              centerX - baseSize / 2,
              centerY + baseSize / 2, // bottom-left
              centerX + baseSize / 2,
              centerY + baseSize / 2, // bottom-right
              centerX,
              centerY - baseSize / 2, // top apex
            ],
            color: selectedColor,
            strokeWidth: pencilSize,
          };
          break;
        case "hexagon":
          const radius_hex = baseSize / 2;
          const points_hex = [];
          for (let i = 0; i < 6; i++) {
            const angle = (i * 2 * Math.PI) / 6;
            points_hex.push(centerX + radius_hex * Math.cos(angle));
            points_hex.push(centerY + radius_hex * Math.sin(angle));
          }
          newElement = {
            id: Date.now(),
            type: "hexagon",
            points: points_hex,
            color: selectedColor,
            strokeWidth: pencilSize,
          };
          break;
        case "pentagon":
          const radius_pent = baseSize / 2;
          const points_pent = [];
          for (let i = 0; i < 5; i++) {
            const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
            points_pent.push(centerX + radius_pent * Math.cos(angle));
            points_pent.push(centerY + radius_pent * Math.sin(angle));
          }
          newElement = {
            id: Date.now(),
            type: "pentagon",
            points: points_pent,
            color: selectedColor,
            strokeWidth: pencilSize,
          };
          break;
        default:
          return;
      }

      setElements((prev) => [...prev, newElement]);
      socket.emit(EVENTS.DRAW_START, {
        roomId,
        element: newElement,
        userId: currentUser?.id,
      });
      setDraggedShape(null);
      setDebugInfo(`Added ${shapeType}`);
    };

    const handlePaletteDragStart = (e, shapeType) => {
      try {
        e.dataTransfer.setData("application/x-shape", shapeType);
        e.dataTransfer.effectAllowed = "copy";
      } catch (_) {}
      setDraggedShape(shapeType);
    };

    const handlePaletteDragEnd = () => {
      setTimeout(() => setDraggedShape(null), 100);
    };

    const handleContainerDragOver = (e) => {
      e.preventDefault();
    };

    const handleContainerDrop = (e) => {
      e.preventDefault();
      const rect = stageContainerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      let shapeType = draggedShape;
      try {
        const dt = e.dataTransfer.getData("application/x-shape");
        if (dt) shapeType = dt;
      } catch (_) {}
      if (shapeType) handleShapeDrop(shapeType, x, y);
      setDraggedShape(null);
    };

    const handleMouseDown = (e) => {
      if (currentTool === "select") {
        const clickedOn = e.target;
        if (
          clickedOn.getClassName() === "Line" ||
          clickedOn.getClassName() === "Circle" ||
          clickedOn.getClassName() === "Rect" ||
          clickedOn.getClassName() === "Text"
        ) {
          setSelectedId(clickedOn.name());
          return;
        } else {
          setSelectedId(null);
        }
        return;
      }

      if (currentTool === "text") {
        e.evt?.stopPropagation();
        e.evt?.preventDefault();
        const stage = e.target.getStage();
        if (!stage) return;
        const pos = stage.getPointerPosition();
        if (!pos) return;

        const clickedOn = e.target;
        let targetShape = null;
        let shapeCenter = null;

        if (clickedOn.getClassName() === "Text") {
          const shapeId = clickedOn.name();
          if (shapeId) {
            const textElement = elements.find(
              (el) => el.id.toString() === shapeId
            );
            if (textElement) {
              setEditingTextId(textElement.id);
              setTextCursor({
                x: textElement.x,
                y: textElement.y,
                text: textElement.text || "",
                shapeId: textElement.shapeId || null,
              });
              setTextFont(textElement.fontFamily || textFont);
              setTextColor(textElement.color || textColor);
              return;
            }
          }
        }

        if (
          clickedOn.getClassName() !== "Stage" &&
          clickedOn.getClassName() !== "Layer" &&
          clickedOn.getClassName() !== "Text"
        ) {
          const shapeId = clickedOn.name();
          if (shapeId) {
            targetShape = elements.find((el) => el.id.toString() === shapeId);
            if (targetShape && targetShape.type !== "text") {
              const shapeBounds = clickedOn.getClientRect();
              const clickX = pos.x;
              const clickY = pos.y;

              if (targetShape.type === "circle") {
                const distance = Math.sqrt(
                  Math.pow(clickX - targetShape.x, 2) +
                    Math.pow(clickY - targetShape.y, 2)
                );
                if (distance <= targetShape.radius) {
                  shapeCenter = { x: clickX, y: clickY };
                } else {
                  shapeCenter = { x: targetShape.x, y: targetShape.y };
                }
              } else if (
                targetShape.type === "rectangle" ||
                targetShape.type === "square"
              ) {
                const width = targetShape.width || targetShape.side;
                const height = targetShape.height || targetShape.side;
                if (
                  clickX >= targetShape.x &&
                  clickX <= targetShape.x + width &&
                  clickY >= targetShape.y &&
                  clickY <= targetShape.y + height
                ) {
                  shapeCenter = { x: clickX, y: clickY };
                } else {
                  shapeCenter = {
                    x: targetShape.x + width / 2,
                    y: targetShape.y + height / 2,
                  };
                }
              } else if (Array.isArray(targetShape.points)) {
                const points = normalizePoints(targetShape.points);
                let sumX = 0,
                  sumY = 0,
                  count = 0;
                for (let i = 0; i < points.length; i += 2) {
                  sumX += points[i];
                  sumY += points[i + 1];
                  count++;
                }
                const centerX = count > 0 ? sumX / count : pos.x;
                const centerY = count > 0 ? sumY / count : pos.y;

                let isInside = false;
                let j = points.length - 2;
                for (let i = 0; i < points.length; i += 2) {
                  const xi = points[i];
                  const yi = points[i + 1];
                  const xj = points[j];
                  const yj = points[j + 1];
                  if (
                    yi > clickY !== yj > clickY &&
                    clickX < ((xj - xi) * (clickY - yi)) / (yj - yi) + xi
                  ) {
                    isInside = !isInside;
                  }
                  j = i;
                }

                if (isInside) {
                  shapeCenter = { x: clickX, y: clickY };
                } else {
                  shapeCenter = { x: centerX, y: centerY };
                }
              }
            }
          }
        }

        const textX = shapeCenter ? shapeCenter.x : pos.x;
        const textY = shapeCenter ? shapeCenter.y : pos.y;

        setTextCursor({
          x: textX,
          y: textY,
          text: "",
          shapeId: targetShape ? targetShape.id : null,
        });
        setEditingTextId(null);
        setDebugInfo(
          `Text cursor at (${Math.round(textX)}, ${Math.round(textY)})`
        );
        return;
      }

      const stage = e.target.getStage();
      const pos = stage.getPointerPosition();

      setIsDrawing(true);
      const newElement = {
        id: Date.now(),
        type: isErasing ? SHAPES.ERASER : SHAPES.FREEHAND,
        points: [[pos.x, pos.y]],
        color: isErasing ? "#ffffff" : selectedColor,
        strokeWidth: isErasing ? eraserSize : pencilSize,
      };

      /* // Store current stroke for shape recognition (disabled)
    setCurrentStroke(newElement); */

      setElements((prev) => [...prev, newElement]);
      currentDrawingElementIdRef.current = newElement.id;
      socket.emit(EVENTS.DRAW_START, {
        roomId,
        element: newElement,
        userId: currentUser?.id,
      });
      setDebugInfo(isErasing ? "Erasing..." : `Drawing with ${selectedColor}`);
    };

    const handleMouseMove = (e) => {
      if (currentTool !== "pencil" && currentTool !== "eraser") return;
      if (!isDrawing) return;

      const stage = e.target.getStage();
      const pos = stage.getPointerPosition();

      setElements((prev) => {
        if (prev.length === 0) return prev;

        const lastIndex = prev.length - 1;
        const lastElement = prev[lastIndex];

        if (
          lastElement.type === SHAPES.FREEHAND ||
          lastElement.type === SHAPES.ERASER
        ) {
          // Ensure points is an array before spreading
          const currentPoints = Array.isArray(lastElement.points)
            ? lastElement.points
            : [];
          const updatedElement = {
            ...lastElement,
            points: [...currentPoints, [pos.x, pos.y]],
            color: isErasing ? "#ffffff" : selectedColor,
          };

          /* // Update current stroke for shape recognition (disabled)
        setCurrentStroke(updatedElement); */

          return [...prev.slice(0, lastIndex), updatedElement];
        }
        return prev;
      });

      // Use the ref to track current drawing element
      socket.emit(EVENTS.DRAW_MOVE, {
        roomId,
        elementId: currentDrawingElementIdRef.current,
        point: [pos.x, pos.y],
        userId: currentUser?.id,
      });
    };

    const handleMouseUp = async () => {
      if (currentTool !== "pencil" && currentTool !== "eraser") return;
      if (!isDrawing) return;
      setIsDrawing(false);
      let recognizedShape = null;
      setElements((prev) => {
        if (prev.length === 0) return prev;
        const lastIndex = prev.length - 1;
        const lastElement = prev[lastIndex];
        if (
          lastElement.type !== SHAPES.FREEHAND ||
          !lastElement.points ||
          !Array.isArray(lastElement.points) ||
          lastElement.points.length < 20 // Increased minimum points to avoid recognizing short strokes/text
        ) {
          return prev;
        }
        // Ensure points array is valid before passing to AI
        const validPoints = lastElement.points.filter(
          (p) =>
            Array.isArray(p) &&
            p.length >= 2 &&
            typeof p[0] === "number" &&
            typeof p[1] === "number"
        );
        // Require at least 20 valid points for shape recognition
        // This filters out short text strokes and small doodles
        if (validPoints.length < 20) {
          return prev;
        }
        // Debug: log point positions to check if coordinates are correct
        const minX = Math.min(...validPoints.map((p) => p[0]));
        const maxX = Math.max(...validPoints.map((p) => p[0]));
        const minY = Math.min(...validPoints.map((p) => p[1]));
        const maxY = Math.max(...validPoints.map((p) => p[1]));
        console.log("Shape recognition attempt:", {
          pointCount: validPoints.length,
          bounds: { minX, maxX, minY, maxY },
          width: maxX - minX,
          height: maxY - minY,
          stageSize,
        });

        const aiResult = aiModelLoaded
          ? aiShapeRecognition.recognizeShape(validPoints)
          : null;
        const recognized = aiResult?.features;
        if (!recognized) {
          console.log(
            "Shape not recognized - likely text or not geometric enough"
          );
          return prev;
        }
        console.log(
          "Shape recognized:",
          recognized.type,
          "at position:",
          recognized
        );
        const newShape = {
          id: lastElement.id,
          ...recognized,
          color: lastElement.color,
          strokeWidth: lastElement.strokeWidth,
        };
        setDebugInfo(
          `Recognized: ${recognized.type}${
            aiResult ? ` (${(aiResult.confidence * 100).toFixed(0)}%)` : ""
          }`
        );
        recognizedShape = newShape;
        return [...prev.slice(0, lastIndex), newShape];
      });

      if (recognizedShape) {
        const { id, ...updatedAttrs } = recognizedShape;
        socket.emit(EVENTS.SHAPE_UPDATE, {
          roomId,
          elementId: id,
          updatedAttrs,
          userId: currentUser?.id,
        });
      }

      /* setCurrentStroke(null); */
      socket.emit(EVENTS.DRAW_END, {
        roomId,
        elementId: currentDrawingElementIdRef.current,
        userId: currentUser?.id,
      });
      currentDrawingElementIdRef.current = null;
      setDebugInfo("Drawing ended");
    };

    // Tool actions
    const handleErase = () => {
      setCurrentTool("eraser");
      setIsErasing(true);
      setIsDrawing(false);
      setDebugInfo("Switched to eraser");
    };

    const handleDraw = () => {
      setCurrentTool("pencil");
      setIsErasing(false);
      // Do not start drawing until the next pointer down
      setIsDrawing(false);
      setDebugInfo(`Pencil selected (${selectedColor})`);
    };

    const handleColorSelect = (color) => {
      setSelectedColor(color);
      setIsErasing(false);
      // Pause drawing; resume on next pointer down
      setIsDrawing(false);
      setDebugInfo(`Selected color: ${color}`);
      // keep panel open to allow multiple selections
    };

    const presetColors = [
      "#111827", // near-black
      "#1f2937", // gray-800
      "#374151", // gray-700
      "#4f46e5", // indigo-600 (primary)
      "#6366f1", // indigo-500
      "#06b6d4", // cyan-500
      "#14b8a6", // teal-500
      "#22c55e", // green-500
      "#eab308", // amber-500
      "#f59e0b", // amber-400
      "#f97316", // orange-500
      "#ef4444", // red-500
      "#ec4899", // pink-500
      "#a855f7", // violet-500
      "#ffffff", // white
    ];

    const canvasPresetColors = [
      "#0b1020", // dark canvas
      "#0f172a", // slate-900
      "#111827", // gray-900
      "#1f2937", // gray-800
      "#111111", // pure-ish dark
      "#ffffff", // white
      "#f8fafc", // slate-50
      "#f1f5f9", // slate-100
      "#e2e8f0", // slate-200
      "#cbd5e1", // slate-300
    ];

    function normalizePoints(points) {
      // Handle null, undefined, or non-array values
      if (!points || !Array.isArray(points)) return [];
      // Handle empty arrays
      if (points.length === 0) return [];
      // Check if first element exists and is an array before accessing it
      const firstElement = points[0];
      if (
        firstElement !== undefined &&
        firstElement !== null &&
        Array.isArray(firstElement)
      ) {
        return points.flat();
      }
      return points;
    }

    return (
      <div className="whiteboard">
        {/* Drawing Tools Panel */}
        <div className="drawing-tools" style={{ display: "block" }}>
          <div className="tools-header">Drawing Tools</div>

          <div className="tool-group">
            <div className="tool-group-title">Tools</div>
            <div className="tool-buttons">
              <button
                className={`tool-btn ${
                  currentTool === "pencil" ? "active" : ""
                }`}
                onClick={handleDraw}
                title="Pencil Tool"
              >
                🖊️
              </button>
              <button
                className={`tool-btn eraser ${
                  currentTool === "eraser" ? "active" : ""
                }`}
                onClick={handleErase}
                title="Eraser Tool"
              >
                🩹
              </button>
              <button
                className="tool-btn"
                onClick={() => {
                  setShowSizeControls(!showSizeControls);
                  setDebugInfo(
                    `Size controls ${showSizeControls ? "hidden" : "shown"}`
                  );
                }}
                title="Adjust Pen and Eraser Size"
              >
                📏
              </button>
              <button
                className={`tool-btn ${
                  currentTool === "select" ? "active" : ""
                }`}
                onClick={() => setCurrentTool("select")}
                title="Select Tool"
              >
                🔍
              </button>
              <button
                className={`tool-btn ${currentTool === "text" ? "active" : ""}`}
                onClick={() => {
                  console.log("Text tool button clicked");
                  setCurrentTool("text");
                  setDebugInfo(
                    "Text tool selected - Click on canvas to add text"
                  );
                }}
                title="Text Tool"
              >
                📝
              </button>
            </div>
          </div>

          <div className="tool-group size-controls-group">
            <div
              className="tool-group-title"
              style={{ display: showSizeControls ? "block" : "none" }}
            >
              Brush Size
            </div>
            {showSizeControls && (
              <div className="size-controls">
                <div className="size-control">
                  <label>Pen: {pencilSize}px</label>
                  <input
                    type="range"
                    min="1"
                    max="20"
                    value={pencilSize}
                    onChange={(e) => setPencilSize(parseInt(e.target.value))}
                    className="size-slider"
                  />
                </div>
                <div className="size-control">
                  <label>Eraser: {eraserSize}px</label>
                  <input
                    type="range"
                    min="5"
                    max="50"
                    value={eraserSize}
                    onChange={(e) => setEraserSize(parseInt(e.target.value))}
                    className="size-slider"
                  />
                </div>
                {currentTool === "text" && (
                  <div className="size-control">
                    <label>Font Size: {fontSize}px</label>
                    <input
                      type="range"
                      min="12"
                      max="72"
                      value={fontSize}
                      onChange={(e) => setFontSize(parseInt(e.target.value))}
                      className="size-slider"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="tool-group">
            <div className="tool-group-title">Shapes</div>
            <div className="shape-palette">
              <div
                className="shape-item"
                draggable
                onDragStart={(e) => handlePaletteDragStart(e, "circle")}
                onDragEnd={handlePaletteDragEnd}
                title="Circle"
              >
                <svg viewBox="0 0 24 24" className="shape-icon">
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                </svg>
              </div>
              <div
                className="shape-item"
                draggable
                onDragStart={(e) => handlePaletteDragStart(e, "square")}
                onDragEnd={handlePaletteDragEnd}
                title="Square"
              >
                <svg viewBox="0 0 24 24" className="shape-icon">
                  <rect
                    x="5"
                    y="5"
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                </svg>
              </div>
              <div
                className="shape-item"
                draggable
                onDragStart={(e) => handlePaletteDragStart(e, "rectangle")}
                onDragEnd={handlePaletteDragEnd}
                title="Rectangle"
              >
                <svg viewBox="0 0 24 24" className="shape-icon">
                  <rect
                    x="3"
                    y="7"
                    width="18"
                    height="10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                </svg>
              </div>
              <div
                className="shape-item"
                draggable
                onDragStart={(e) => handlePaletteDragStart(e, "triangle")}
                onDragEnd={handlePaletteDragEnd}
                title="Triangle"
              >
                <svg viewBox="0 0 24 24" className="shape-icon">
                  <polygon
                    points="12,4 20,18 4,18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                </svg>
              </div>
              <div
                className="shape-item"
                draggable
                onDragStart={(e) => handlePaletteDragStart(e, "hexagon")}
                onDragEnd={handlePaletteDragEnd}
                title="Hexagon"
              >
                <svg viewBox="0 0 24 24" className="shape-icon">
                  <polygon
                    points="8,4 16,4 20,12 16,20 8,20 4,12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                </svg>
              </div>
              <div
                className="shape-item"
                draggable
                onDragStart={(e) => handlePaletteDragStart(e, "pentagon")}
                onDragEnd={handlePaletteDragEnd}
                title="Pentagon"
              >
                <svg viewBox="0 0 24 24" className="shape-icon">
                  <polygon
                    points="12,3 20,9 17,20 7,20 4,9"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                </svg>
              </div>
            </div>
          </div>

          <div className="tool-group">
            <div className="tool-group-title">Pen Color</div>
            <button
              className="canvas-color-btn"
              onClick={() => setShowPenColorPicker(!showPenColorPicker)}
              title="Choose pen color"
            >
              <div
                className="color-preview"
                style={{ backgroundColor: selectedColor }}
              ></div>
              <span>Pen Color</span>
              <span className="color-icon">⚡</span>
            </button>
          </div>

          <div className="tool-group">
            <div className="tool-group-title">Canvas Background</div>
            <button
              className="canvas-color-btn"
              onClick={() => setShowCanvasColorPicker(!showCanvasColorPicker)}
              title="Choose canvas background color"
            >
              <div
                className="color-preview"
                style={{ backgroundColor: canvasColor }}
              ></div>
              <span>Canvas Color</span>
              <span className="color-icon">⚡</span>
            </button>
          </div>

          {showPenColorPicker && (
            <div
              className="color-panel-overlay"
              onClick={() => {
                setShowPenColorPicker(false);
                setIsDrawing(false);
                setDebugInfo("Color picker closed - Drawing paused");
              }}
            >
              <div className="color-panel" onClick={(e) => e.stopPropagation()}>
                <div className="color-panel-header">
                  <h3>Choose Pen Color</h3>
                  <button
                    className="close-btn"
                    onClick={() => {
                      setShowPenColorPicker(false);
                      setIsDrawing(false);
                      setDebugInfo("Color picker closed - Drawing paused");
                    }}
                  >
                    ✕
                  </button>
                </div>

                <div className="color-panel-content">
                  <div className="custom-color-section">
                    <label>Custom Color</label>
                    <input
                      type="color"
                      className="color-picker"
                      value={selectedColor}
                      onChange={(e) => handleColorSelect(e.target.value)}
                      title="Choose custom pen color"
                    />
                  </div>

                  <div className="preset-colors-section">
                    <label>Preset Colors</label>
                    <div className="preset-colors">
                      {presetColors.map((color) => (
                        <button
                          key={color}
                          className={`preset-color-btn ${
                            selectedColor === color ? "selected" : ""
                          }`}
                          style={{ backgroundColor: color }}
                          onClick={() => handleColorSelect(color)}
                          title={`Select ${color}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {showCanvasColorPicker && (
            <div
              className="color-panel-overlay"
              onClick={() => {
                setShowCanvasColorPicker(false);
                setIsDrawing(false);
              }}
            >
              <div className="color-panel" onClick={(e) => e.stopPropagation()}>
                <div className="color-panel-header">
                  <h3>Choose Canvas Color</h3>
                  <button
                    className="close-btn"
                    onClick={() => setShowCanvasColorPicker(false)}
                  >
                    ✕
                  </button>
                </div>

                <div className="color-panel-content">
                  <div className="custom-color-section">
                    <label>Custom Color</label>
                    <input
                      type="color"
                      className="color-picker"
                      value={canvasColor}
                      onChange={(e) => {
                        setCanvasColor(e.target.value);
                        setIsDrawing(false);
                      }}
                      title="Choose custom canvas color"
                    />
                  </div>

                  <div className="preset-colors-section">
                    <label>Preset Colors</label>
                    <div className="preset-colors">
                      {canvasPresetColors.map((color) => (
                        <button
                          key={color}
                          className={`preset-color-btn ${
                            canvasColor === color ? "selected" : ""
                          }`}
                          style={{ backgroundColor: color }}
                          onClick={() => {
                            setCanvasColor(color);
                            setIsDrawing(false);
                          }}
                          title={`Select ${color}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Floating Canvas Controls */}
        <div className="canvas-controls">
          <button
            className="canvas-btn"
            onClick={handleExportPDF}
            title="Save as PDF"
          >
            📄
          </button>
          <button
            className="canvas-btn"
            onClick={() => setShowGrid(!showGrid)}
            title={showGrid ? "Hide Grid" : "Show Grid"}
          >
            ⊞
          </button>
          <button
            className="canvas-btn danger"
            onClick={() => {
              setElements([]);
              socket.emit(EVENTS.CLEAR_BOARD, { roomId });
            }}
            title="Clear Canvas"
          >
            🗑️
          </button>
        </div>

        <div className="debug-info">{debugInfo}</div>

        {/* Canvas Grid Background */}
        {showGrid && <div className="canvas-grid" />}

        {/* Empty State */}
        {elements.length === 0 && (
          <div className="canvas-empty-state">
            <div className="empty-icon">✨</div>
            <div className="empty-text">Ready to create!</div>
            <div className="empty-hint">✏️ Pick a tool & start sketching!</div>
          </div>
        )}

        <div
          className="stage-container"
          ref={stageContainerRef}
          onDragOver={handleContainerDragOver}
          onDrop={handleContainerDrop}
        >
          <Stage
            width={stageSize.width}
            height={stageSize.height}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            ref={stageRef}
            style={{ backgroundColor: canvasColor }}
          >
            <Layer>
              {elements.map((element) => {
                if (
                  element.type === SHAPES.FREEHAND ||
                  element.type === SHAPES.ERASER
                ) {
                  return (
                    <Line
                      key={element.id}
                      name={element.id.toString()}
                      draggable={currentTool === "select"}
                      points={normalizePoints(element.points)}
                      stroke={element.color || selectedColor}
                      strokeWidth={
                        element.strokeWidth ||
                        (isErasing ? eraserSize : pencilSize)
                      }
                      tension={0.5}
                      lineCap="round"
                      lineJoin="round"
                      globalCompositeOperation={
                        element.type === SHAPES.ERASER
                          ? "destination-out"
                          : "source-over"
                      }
                      strokeScaleEnabled={false}
                    />
                  );
                }
                if (element.type === "line") {
                  return (
                    <Line
                      key={element.id}
                      name={element.id.toString()}
                      draggable={currentTool === "select"}
                      points={normalizePoints(element.points)}
                      stroke={element.color || selectedColor}
                      strokeWidth={element.strokeWidth || pencilSize}
                      tension={0.5}
                      lineCap="round"
                      lineJoin="round"
                      strokeScaleEnabled={false}
                    />
                  );
                }
                if (element.type === "circle") {
                  return (
                    <Circle
                      name={element.id.toString()}
                      draggable={currentTool === "select"}
                      key={element.id}
                      x={element.x}
                      y={element.y}
                      radius={element.radius}
                      stroke={element.color || selectedColor}
                      strokeWidth={element.strokeWidth || pencilSize}
                      strokeScaleEnabled={false}
                    />
                  );
                }
                if (element.type === "rectangle") {
                  // Validate rectangle properties before rendering
                  if (
                    !element.x ||
                    !element.y ||
                    !element.width ||
                    !element.height ||
                    isNaN(element.x) ||
                    isNaN(element.y) ||
                    isNaN(element.width) ||
                    isNaN(element.height) ||
                    element.width <= 0 ||
                    element.height <= 0
                  ) {
                    console.warn("Invalid rectangle element:", element);
                    return null;
                  }
                  return (
                    <Rect
                      name={element.id.toString()}
                      draggable={currentTool === "select"}
                      key={element.id}
                      x={element.x}
                      y={element.y}
                      width={element.width}
                      height={element.height}
                      stroke={element.color || selectedColor}
                      strokeWidth={element.strokeWidth || pencilSize}
                      strokeScaleEnabled={false}
                    />
                  );
                }
                if (element.type === "square") {
                  return (
                    <Rect
                      name={element.id.toString()}
                      draggable={currentTool === "select"}
                      key={element.id}
                      x={element.x}
                      y={element.y}
                      width={element.side}
                      height={element.side}
                      stroke={element.color}
                      strokeWidth={element.strokeWidth}
                      strokeScaleEnabled={false}
                    />
                  );
                }
                if (element.type === "triangle") {
                  return (
                    <Line
                      key={element.id}
                      name={element.id.toString()}
                      draggable={currentTool === "select"}
                      points={normalizePoints(element.points)}
                      closed
                      stroke={element.color}
                      strokeWidth={element.strokeWidth}
                      strokeScaleEnabled={false}
                    />
                  );
                }
                if (element.type === "hexagon") {
                  return (
                    <Line
                      key={element.id}
                      name={element.id.toString()}
                      draggable={currentTool === "select"}
                      points={normalizePoints(element.points)}
                      closed
                      stroke={element.color || selectedColor}
                      strokeWidth={element.strokeWidth || pencilSize}
                      strokeScaleEnabled={false}
                    />
                  );
                }
                if (element.type === "pentagon") {
                  return (
                    <Line
                      key={element.id}
                      name={element.id.toString()}
                      draggable={currentTool === "select"}
                      points={normalizePoints(element.points)}
                      closed
                      stroke={element.color || selectedColor}
                      strokeWidth={element.strokeWidth || pencilSize}
                      strokeScaleEnabled={false}
                    />
                  );
                }
                if (element.type === "text") {
                  const isEditing = editingTextId === element.id;
                  const displayText = element.text || "";

                  return (
                    <React.Fragment key={element.id}>
                      <Text
                        name={element.id.toString()}
                        draggable={currentTool === "select" && !isEditing}
                        x={element.x}
                        y={element.y}
                        text={displayText}
                        fontSize={element.fontSize || fontSize}
                        fill={element.color || selectedColor}
                        fontFamily={element.fontFamily || "Arial"}
                        width={element.width || undefined}
                        height={element.height || undefined}
                        align={element.align || "left"}
                        verticalAlign={element.verticalAlign || "top"}
                        wrap="word"
                        onClick={(e) => {
                          if (currentTool === "text") {
                            setEditingTextId(element.id);
                            setTextCursor({
                              x: element.x,
                              y: element.y,
                              text: element.text || "",
                              shapeId: element.shapeId || null,
                            });
                            setTextFont(element.fontFamily || textFont);
                            setTextColor(element.color || textColor);
                          } else if (currentTool === "select") {
                            e.cancelBubble = true;
                          }
                        }}
                      />
                      {isEditing && cursorBlink && (
                        <Line
                          points={[
                            element.x +
                              displayText.length *
                                (element.fontSize || fontSize) *
                                0.6,
                            element.y,
                            element.x +
                              displayText.length *
                                (element.fontSize || fontSize) *
                                0.6,
                            element.y + (element.fontSize || fontSize),
                          ]}
                          stroke={element.color || selectedColor}
                          strokeWidth={2}
                        />
                      )}
                    </React.Fragment>
                  );
                }
                return null;
              })}
              {textCursor && !editingTextId && (
                <>
                  <Text
                    x={textCursor.x}
                    y={textCursor.y}
                    text={textCursor.text || ""}
                    fontSize={fontSize}
                    fill={textColor}
                    fontFamily={textFont}
                  />
                  {cursorBlink && (
                    <Line
                      points={[
                        textCursor.x +
                          (textCursor.text || "").length * fontSize * 0.6,
                        textCursor.y,
                        textCursor.x +
                          (textCursor.text || "").length * fontSize * 0.6,
                        textCursor.y + fontSize,
                      ]}
                      stroke={textColor}
                      strokeWidth={2}
                    />
                  )}
                </>
              )}
              <Transformer
                ref={transformerRef}
                boundBoxFunc={(oldBox, newBox) =>
                  newBox.width < 5 || newBox.height < 5 ? oldBox : newBox
                }
              />
            </Layer>
          </Stage>
        </div>

        {textContextMenu && textCursor && (
          <div
            className="text-context-menu-overlay"
            onClick={() => setTextContextMenu(null)}
          >
            <div
              className="text-context-menu"
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                left: `${textContextMenu.x}px`,
                top: `${textContextMenu.y}px`,
              }}
            >
              <div className="context-menu-header">
                <h4>Text Options</h4>
                <p
                  style={{
                    fontSize: "11px",
                    color: "#666",
                    margin: "4px 0 0 0",
                    fontStyle: "italic",
                  }}
                >
                  Press ↑ to open
                </p>
                <button
                  className="close-btn"
                  onClick={() => setTextContextMenu(null)}
                >
                  ✕
                </button>
              </div>

              <div className="context-menu-section">
                <label>Font Family</label>
                <select
                  value={textFont}
                  onChange={(e) => setTextFont(e.target.value)}
                  className="font-select"
                >
                  <option value="Arial">Arial</option>
                  <option value="Times New Roman">Times New Roman</option>
                  <option value="Courier New">Courier New</option>
                  <option value="Georgia">Georgia</option>
                  <option value="Verdana">Verdana</option>
                  <option value="Comic Sans MS">Comic Sans MS</option>
                  <option value="Impact">Impact</option>
                  <option value="Trebuchet MS">Trebuchet MS</option>
                </select>
              </div>

              <div className="context-menu-section">
                <label>Font Size: {fontSize}px</label>
                <input
                  type="range"
                  min="12"
                  max="72"
                  value={fontSize}
                  onChange={(e) => setFontSize(parseInt(e.target.value))}
                  className="size-slider"
                />
              </div>

              <div className="context-menu-section">
                <label>Text Color</label>
                <div className="color-picker-row">
                  <input
                    type="color"
                    value={textColor}
                    onChange={(e) => setTextColor(e.target.value)}
                    className="color-picker"
                  />
                  <div className="preset-text-colors">
                    {[
                      "#000000",
                      "#FF0000",
                      "#00FF00",
                      "#0000FF",
                      "#FFFF00",
                      "#FF00FF",
                      "#00FFFF",
                    ].map((color) => (
                      <button
                        key={color}
                        className={`preset-color-btn ${
                          textColor === color ? "selected" : ""
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => setTextColor(color)}
                        title={color}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <style>{`
          :root {
            --primary: #4f46e5;
            --primary-600: #4f46e5;
            --primary-500: #6366f1;
            --accent: #22c55e;
            --text: #111827;
            --muted: #6b7280;
            --panel-bg: #ffffff;
            --panel-border: #e5e7eb;
            --panel-shadow: 0 10px 25px rgba(2, 6, 23, 0.12);
          }

          .whiteboard {
            position: relative;
            width: 100%;
            height: 100%;
            overflow: visible;
            color: var(--text);
          }
          .stage-container {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
          }

          .drawing-tools {
            position: absolute;
            top: 10px;
            left: 10px;
            background: var(--panel-bg);
            border-radius: 14px;
            padding: 16px 16px 18px;
            box-shadow: var(--panel-shadow);
            border: 1px solid var(--panel-border);
            z-index: 10;
            width: 320px;
            min-height: 100px;
            max-height: 85vh;
            overflow-y: auto;
            display: block !important;
            backdrop-filter: saturate(120%) blur(3px);
            animation: panel-in 220ms ease-out;
            scroll-behavior: smooth;
          }

          .drawing-tools::-webkit-scrollbar {
            width: 10px;
          }
          .drawing-tools::-webkit-scrollbar-thumb {
            background: linear-gradient(180deg, var(--primary-500), var(--primary-600));
            border-radius: 8px;
            border: 2px solid #ffffff;
          }
          .drawing-tools::-webkit-scrollbar-track {
            background: #f3f4f6;
            border-radius: 8px;
          }

          @keyframes panel-in {
            from { opacity: 0; transform: translateY(-6px); }
            to { opacity: 1; transform: translateY(0); }
          }

          .tools-header {
            font-weight: 700;
            letter-spacing: 0.2px;
            margin-bottom: 14px;
            padding-bottom: 8px;
            border-bottom: 1px dashed var(--panel-border);
            text-align: center;
          }

          .tool-group {
            margin-bottom: 16px;
            padding: 12px;
            border: 1px solid var(--panel-border);
            border-radius: 10px;
            transition: box-shadow 180ms ease, transform 180ms ease;
          }
          .tool-group:hover {
            box-shadow: 0 6px 16px rgba(2, 6, 23, 0.08);
            transform: translateY(-1px);
          }

          .size-controls-group {
            margin-bottom: 16px;
            padding: 12px;
            border: 1px solid var(--panel-border);
            border-radius: 10px;
            transition: max-height 0.3s ease-in-out;
            overflow: hidden;
          }

          .tool-group-title {
            font-size: 12px;
            color: var(--muted);
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 0.06em;
          }

          .tool-buttons {
            display: flex;
            gap: 10px;
            justify-content: space-between;
          }

          .tool-btn {
            padding: 10px;
            border: 1px solid var(--panel-border);
            background: #ffffff;
            border-radius: 10px;
            transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease, background 140ms ease;
            box-shadow: 0 2px 8px rgba(2, 6, 23, 0.04);
          }
          .tool-btn:hover {
            transform: translateY(-1px);
            border-color: var(--primary-500);
            box-shadow: 0 6px 16px rgba(2, 6, 23, 0.08);
          }
          .tool-btn.active {
            background: linear-gradient(180deg, #ffffff, #fafafa);
            border-color: var(--primary);
            box-shadow: 0 8px 18px rgba(79, 70, 229, 0.12);
          }
          .tool-btn.danger:hover {
            border-color: #ef4444;
          }

          .size-controls label {
            font-size: 12px;
            color: var(--muted);
          }
          .size-slider {
            accent-color: var(--primary);
            transition: filter 140ms ease;
          }
          .size-slider:hover {
            filter: brightness(0.95);
          }

          .canvas-color-btn {
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            padding: 10px 12px;
            border: 1px solid var(--panel-border);
            border-radius: 10px;
            background: #ffffff;
            transition: border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease;
          }
          .canvas-color-btn:hover {
            border-color: var(--primary-500);
            transform: translateY(-1px);
            box-shadow: 0 6px 16px rgba(2, 6, 23, 0.06);
          }

          .color-preview {
            width: 22px;
            height: 22px;
            border-radius: 6px;
            border: 1px solid var(--panel-border);
          }
          .color-icon {
            color: var(--primary);
          }

          .preset-colors {
            display: grid;
            grid-template-columns: repeat(6, 1fr);
            gap: 6px;
          }

          .preset-color-btn {
            width: 28px;
            height: 28px;
            border: 1px solid var(--panel-border);
            border-radius: 6px;
            cursor: pointer;
            padding: 0;
            transition: transform 120ms ease, box-shadow 140ms ease, border-color 120ms ease;
          }

          .preset-color-btn:hover {
            transform: translateY(-1px) scale(1.03);
            box-shadow: 0 5px 12px rgba(2, 6, 23, 0.08);
            border-color: var(--primary-500);
          }

          .preset-color-btn.selected {
            border: 2px solid var(--primary);
            transform: translateY(-1px) scale(1.06);
            box-shadow: 0 8px 18px rgba(79, 70, 229, 0.15);
          }

          .shape-palette {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
          }

          .shape-item {
            padding: 12px;
            border: 2px solid var(--panel-border);
            background: white;
            border-radius: 10px;
            cursor: grab;
            text-align: center;
            transition: all 160ms ease;
            user-select: none;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .shape-icon {
            width: 24px;
            height: 24px;
            color: #111;
          }

          .shape-item:active {
            cursor: grabbing;
          }

          .shape-item:hover {
            border-color: var(--primary-500);
            background: #f0f8ff;
            transform: translateY(-1px) scale(1.04);
            box-shadow: 0 6px 16px rgba(2, 6, 23, 0.08);
          }

          .canvas-controls {
            position: absolute;
            top: 12px;
            right: 12px;
            display: flex;
            gap: 10px;
          }
          .canvas-btn {
            padding: 10px;
            border: 1px solid var(--panel-border);
            border-radius: 10px;
            background: #ffffff;
            box-shadow: 0 2px 8px rgba(2, 6, 23, 0.05);
            transition: transform 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
          }
          .canvas-btn:hover {
            transform: translateY(-1px);
            border-color: var(--primary-500);
            box-shadow: 0 6px 16px rgba(2, 6, 23, 0.08);
          }
          .canvas-btn.danger:hover {
            border-color: #ef4444;
            box-shadow: 0 8px 18px rgba(239,68,68,0.15);
          }

          .debug-info {
            position: absolute;
            left: 10px;
            bottom: 10px;
            padding: 8px 10px;
            background: rgba(255,255,255,0.9);
            border: 1px solid var(--panel-border);
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(2, 6, 23, 0.06);
            font-size: 12px;
          }

          .canvas-grid {
            position: absolute;
            inset: 0;
            background-image: linear-gradient(#eef2ff 1px, transparent 1px), linear-gradient(90deg, #eef2ff 1px, transparent 1px);
            background-size: 24px 24px;
            animation: grid-in 240ms ease-out;
          }
          @keyframes grid-in {
            from { opacity: 0; }
            to { opacity: 1; }
          }

          .text-context-menu-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 2000;
            background: transparent;
          }

          .text-context-menu {
            background: white;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            padding: 16px;
            min-width: 250px;
            z-index: 2001;
          }

          .context-menu-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            padding-bottom: 12px;
            border-bottom: 1px solid #e5e7eb;
          }

          .context-menu-header h4 {
            margin: 0;
            font-size: 16px;
            font-weight: 600;
            color: #1f2937;
          }

          .context-menu-section {
            margin-bottom: 16px;
          }

          .context-menu-section:last-child {
            margin-bottom: 0;
          }

          .context-menu-section label {
            display: block;
            margin-bottom: 8px;
            font-size: 14px;
            font-weight: 500;
            color: #374151;
          }

          .font-select {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            font-size: 14px;
            background: white;
            cursor: pointer;
          }

          .font-select:hover {
            border-color: #9ca3af;
          }

          .color-picker-row {
            display: flex;
            align-items: center;
            gap: 12px;
          }

          .text-context-menu .color-picker {
            width: 50px;
            height: 40px;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            cursor: pointer;
          }

          .preset-text-colors {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
          }

          .preset-text-colors .preset-color-btn {
            width: 32px;
            height: 32px;
            border: 2px solid transparent;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s;
          }

          .preset-text-colors .preset-color-btn:hover {
            transform: scale(1.1);
            border-color: #9ca3af;
          }

          .preset-text-colors .preset-color-btn.selected {
            border-color: #4f46e5;
            box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.2);
          }

          .canvas-empty-state {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
            color: #999;
            z-index: 2;
            pointer-events: none;
          }

          .empty-icon {
            font-size: 40px;
            margin-bottom: 10px;
          }

          .empty-text {
            font-size: 18px;
            margin-bottom: 5px;
            font-weight: bold;
          }

          .empty-hint {
            font-size: 14px;
          }

          .color-panel-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 100;
          }

          .color-panel {
            background: white;
            border-radius: 8px;
            padding: 15px;
            width: 300px;
            max-width: 90%;
          }

          .color-panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
          }

          .color-panel-header h3 {
            margin: 0;
            font-size: 16px;
          }

          .close-btn {
            background: none;
            border: none;
            font-size: 18px;
            cursor: pointer;
          }

          .color-panel-content {
            display: flex;
            flex-direction: column;
            gap: 15px;
          }

          .custom-color-section,
          .preset-colors-section {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .custom-color-section label,
          .preset-colors-section label {
            font-size: 14px;
            font-weight: bold;
          }

          .color-picker {
            width: 100%;
            height: 40px;
          }

          .preset-colors {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 5px;
          }

          .preset-color-btn {
            width: 25px;
            height: 25px;
            border: 1px solid #ddd;
            border-radius: 3px;
            cursor: pointer;
            padding: 0;
          }

          .preset-color-btn.selected {
            border: 2px solid #1890ff;
            transform: scale(1.1);
          }

          .shape-palette {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
          }

          .shape-item {
            padding: 12px;
            border: 2px solid #ddd;
            background: white;
            border-radius: 6px;
            cursor: grab;
            text-align: center;
            transition: all 0.2s ease;
            user-select: none;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .shape-icon {
            width: 24px;
            height: 24px;
            color: #111;
          }

          .shape-item:active {
            cursor: grabbing;
          }

          .shape-item:hover {
            border-color: #1890ff;
            background: #f0f8ff;
            transform: scale(1.05);
          }
        `}</style>
      </div>
    );
  }
);

export default Whiteboard;
