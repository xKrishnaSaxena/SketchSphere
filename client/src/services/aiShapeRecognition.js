class MinimalAIShapeRecognition {
  constructor() {
    this.isReady = false;
    this.shapeClasses = ["line", "circle", "rectangle", "square", "triangle", "hexagon", "pentagon"];
  }

  async initialize() {
    await new Promise((r) => setTimeout(r, 50));
    this.isReady = true;
    return true;
  }

  extractFeatures(points) {
    if (!points || points.length < 15) return null;

    const cleanPoints = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const dist = Math.hypot(
        points[i][0] - cleanPoints[cleanPoints.length - 1][0],
        points[i][1] - cleanPoints[cleanPoints.length - 1][1]
      );
      if (dist > 2) cleanPoints.push(points[i]);
    }
    if (cleanPoints.length < 10) return null;

    const xs = cleanPoints.map((p) => p[0]);
    const ys = cleanPoints.map((p) => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const width = maxX - minX;
    const height = maxY - minY;

    const startEndDist = Math.hypot(
      cleanPoints[0][0] - cleanPoints[cleanPoints.length - 1][0],
      cleanPoints[0][1] - cleanPoints[cleanPoints.length - 1][1]
    );
    const diagonal = Math.hypot(width, height);
    const isClosed = startEndDist < Math.min(width, height) * 0.15 ? 1 : 0;

    if (isClosed && (width < 15 || height < 15)) return null;

    const n = cleanPoints.length;
    let smoothed = [...cleanPoints];
    for (let pass = 0; pass < 2; pass++) {
      smoothed = smoothed.map((p, i) => {
        let prev, next;
        if (isClosed) {
          prev = smoothed[(i - 2 + n) % n];
          next = smoothed[(i + 2) % n];
        } else {
          prev = smoothed[Math.max(0, i - 2)];
          next = smoothed[Math.min(n - 1, i + 2)];
        }
        const x = (prev[0] * 0.25 + p[0] * 0.5 + next[0] * 0.25);
        const y = (prev[1] * 0.25 + p[1] * 0.5 + next[1] * 0.25);
        return [x, y];
      });
    }

    let pathLength = 0;
    for (let i = 1; i < smoothed.length; i++) {
      pathLength += Math.hypot(
        smoothed[i][0] - smoothed[i - 1][0],
        smoothed[i][1] - smoothed[i - 1][1]
      );
    }
    const straightDistance = Math.hypot(
      smoothed[smoothed.length - 1][0] - smoothed[0][0],
      smoothed[smoothed.length - 1][1] - smoothed[0][1]
    );

    const aspect = Math.max(width, height) / Math.max(1, Math.min(width, height));
    const straightness = straightDistance > 0 ? pathLength / straightDistance : 1;
    const squareness = 1 - Math.abs(width - height) / Math.max(width, height);

    let corners = 0;
    const cornerAngles = [];
    const cornerIndices = [];
    const endLimit = isClosed ? n : n - 1;
    
    const lookahead = Math.max(2, Math.floor(n / 20));
    
    for (let i = lookahead; i < endLimit - lookahead; i++) {
      const dx1 = smoothed[i][0] - smoothed[i - lookahead][0];
      const dy1 = smoothed[i][1] - smoothed[i - lookahead][1];
      const dx2 = smoothed[(i + lookahead) % n][0] - smoothed[i][0];
      const dy2 = smoothed[(i + lookahead) % n][1] - smoothed[i][1];
      
      const dist1 = Math.hypot(dx1, dy1);
      const dist2 = Math.hypot(dx2, dy2);
      
      // Skip if segments too short (noise)
      if (dist1 < 5 || dist2 < 5) continue;
      
      let angleDiff = Math.atan2(dy2, dx2) - Math.atan2(dy1, dx1);
      
      // Normalize to [-π, π]
      while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
      while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
      
      // Convert to absolute angle change
      const angle = Math.abs(angleDiff);
      
      // Stricter corner detection: require significant angle change
      if (angle > Math.PI / 4 && angle < (3 * Math.PI) / 4) {
        // Check if this is a distinct corner (not too close to previous)
        let isDistinct = true;
        for (const idx of cornerIndices) {
          const dist = Math.hypot(
            smoothed[i][0] - smoothed[idx][0],
            smoothed[i][1] - smoothed[idx][1]
          );
          if (dist < Math.min(width, height) / 6) { // slightly stricter spacing
            isDistinct = false;
            break;
          }
        }
        
        if (isDistinct) {
          corners++;
          cornerAngles.push(angle);
          cornerIndices.push(i);
        }
      }
    }

    // Calculate circularity measure
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const avgRadius = (width + height) / 4;
    let radiusVariance = 0;
    
    if (isClosed) {
      smoothed.forEach(p => {
        const distFromCenter = Math.hypot(p[0] - centerX, p[1] - centerY);
        radiusVariance += Math.abs(distFromCenter - avgRadius);
      });
      radiusVariance /= smoothed.length;
    }
    const circularity = isClosed && avgRadius > 0 ? 1 - (radiusVariance / avgRadius) : 0;

    // New: convexity and right-angle score (for squares/rectangles)
    let isConvex = 1;
    let rightAngleScore = 0;
    if (isClosed && cornerIndices.length >= 3) {
      const verts = cornerIndices.map(idx => smoothed[idx]);
      const m = verts.length;
      let lastSign = 0;
      for (let i = 0; i < m; i++) {
        const a = verts[i];
        const b = verts[(i + 1) % m];
        const c = verts[(i + 2) % m];
        const abx = b[0] - a[0];
        const aby = b[1] - a[1];
        const bcx = c[0] - b[0];
        const bcy = c[1] - b[1];
        const cross = abx * bcy - aby * bcx;
        const sign = Math.sign(cross);
        if (lastSign === 0) lastSign = sign;
        else if (sign !== 0 && sign !== lastSign) {
          isConvex = 0;
        }
        // right angle proximity
        const dot = abx * bcx + aby * bcy;
        const mag1 = Math.hypot(abx, aby);
        const mag2 = Math.hypot(bcx, bcy);
        if (mag1 > 0 && mag2 > 0) {
          const cos = dot / (mag1 * mag2);
          if (Math.abs(cos) < 0.2) rightAngleScore += 1; // within ~78-102 degrees
        }
      }
      rightAngleScore = rightAngleScore / m;
    }

    return {
      width,
      height,
      aspect,
      isClosed,
      straightness,
      squareness,
      minX,
      minY,
      maxX,
      maxY,
      corners,
      circularity,
      cornerAngles,
      diagonal,
      isConvex,
      rightAngleScore,
      startX: smoothed[0][0],
      startY: smoothed[0][1],
      endX: smoothed[smoothed.length - 1][0],
      endY: smoothed[smoothed.length - 1][1],
    };
  }

  // ============================================================================
  // SHAPE RECOGNITION: ENHANCED CLASSIFICATION MODEL
  // ============================================================================
  // This method uses a weighted linear model to classify shapes based on extracted features:
  // 
  // IMPROVEMENTS MADE:
  // 1. Stricter Classification Logic:
  //    - Uses exact corner count (rounded) for precise matching
  //    - Requires minimum 60% confidence threshold (prevents false positives)
  //    - Differentiates between similar shapes (square vs rectangle, hexagon vs pentagon)
  //
  // 2. Shape-Specific Scoring:
  //    - Line: High aspect ratio, low straightness, not closed, zero corners
  //    - Circle: High circularity, closed, aspect ratio ~1, minimal corners
  //    - Triangle: Exact 3 corners (highest priority when detected), closed, convex
  //    - Square: 4 corners, high squareness, aspect ratio ~1, right angles, low circularity
  //    - Rectangle: 4 corners, LOW squareness, aspect ratio > 1.3, right angles
  //    - Hexagon: Exact 6 corners, closed, moderate circularity
  //    - Pentagon: Exact 5 corners, closed, moderate circularity
  //
  // 3. Softmax Probability Distribution:
  //    - Converts raw scores (logits) to probabilities using softmax function
  //    - Returns probability array [line, circle, rectangle, square, triangle, hexagon, pentagon]
  //    - Only returns probabilities if maximum confidence >= 0.6
  //
  // Returns: Array of 7 probabilities (one per shape type) or null if confidence too low
  // Enhanced linear model with precise classification for all shapes
  predictProbs(f) {
    // Much stricter thresholds for better precision
    const exactCorners = Math.round(f.corners);
    
    // Line: high aspect ratio, low straightness, not closed, NO corners
    const zLine =
      3.0 * (f.aspect - 1) +
      2.0 * (2.5 - Math.min(f.straightness, 3)) +
      (f.isClosed ? -3.0 : 2.0) -
      1.5 * exactCorners -
      2.5 * f.circularity;
    
    // Circle: closed, high circularity, very few corners, aspect ratio ~1
    const zCircle =
      1.8 * f.isClosed +
      2.5 * f.circularity +
      0.8 * f.squareness -
      0.8 * (f.aspect - 1) -
      5.0 * Math.max(0, exactCorners) -
      0.8 * Math.abs(exactCorners) -
      (f.corners > 1 ? -3.0 : 0);
    
    // Triangle: closed, exactly 3 corners ONLY - highest priority when detected
    const zTriangle =
      2.2 * f.isClosed +
      (exactCorners === 3 ? 8.0 : 0) -
      5.0 * Math.abs(3 - exactCorners) -
      2.0 * f.circularity -
      1.0 * f.squareness +
      0.5 * (f.isConvex ? 1 : -1);
    
    // Square: closed, 4 corners, high squareness, aspect ratio ~1, LOW circularity, right angles
    const zSquare =
      1.5 * f.isClosed +
      (exactCorners === 4 ? 3.5 : 0) +
      3.0 * f.squareness +
      (f.aspect <= 1.2 ? 3.0 * (1 - Math.abs(f.aspect - 1)) : -3.0) -
      3.0 * f.circularity +
      1.5 * f.rightAngleScore +
      0.5 * (f.isConvex ? 1 : -1);
    
    // Rectangle: closed, 4 corners, LOW squareness, aspect ratio > 1.3, LOW circularity, right angles
    const zRect =
      1.5 * f.isClosed +
      (exactCorners === 4 ? 3.5 : 0) +
      (f.squareness < 0.8 ? 2.0 : -2.0) +
      (f.aspect > 1.3 ? 2.0 * Math.min(f.aspect - 1, 3) : -3.0) -
      3.0 * f.circularity +
      1.5 * f.rightAngleScore +
      0.5 * (f.isConvex ? 1 : -1);
    
    // Hexagon: closed, exactly 6 corners
    const zHexagon =
      1.5 * f.isClosed +
      (exactCorners === 6 ? 4.5 : 0) -
      3.0 * Math.abs(6 - exactCorners) +
      0.5 * f.circularity -
      0.5 * Math.abs(f.aspect - 1);
    
    // Pentagon: closed, exactly 5 corners
    const zPentagon =
      1.5 * f.isClosed +
      (exactCorners === 5 ? 4.5 : 0) -
      3.0 * Math.abs(5 - exactCorners) +
      0.5 * f.circularity -
      0.5 * Math.abs(f.aspect - 1);

    const logits = [zLine, zCircle, zRect, zSquare, zTriangle, zHexagon, zPentagon];
    const maxZ = Math.max(...logits);
    const exps = logits.map((z) => Math.exp(z - maxZ));
    const sum = exps.reduce((a, b) => a + b, 0);
    const probs = exps.map((e) => e / Math.max(1e-8, sum));
    
    // Additional precision check: require minimum confidence
    const maxProb = Math.max(...probs);
    if (maxProb < 0.6) {
      return null;
    }
    
    return probs;
  }

  // ============================================================================
  // SHAPE RECOGNITION: MAIN RECOGNITION ENTRY POINT
  // ============================================================================
  // This is the main method called to recognize a shape from hand-drawn points:
  // 
  // PROCESS FLOW:
  // 1. Checks if AI service is ready (currently always ready, but designed for future AI model)
  // 2. Extracts geometric features from the point array
  // 3. Uses predictProbs() to get shape classification probabilities
  // 4. If AI prediction fails or confidence is low, falls back to heuristicRecognize()
  // 5. Converts recognized shape to perfect geometric representation using convertToShape()
  // 6. Returns object with: { type, confidence, features }
  //
  // FALLBACK SYSTEM:
  // - If AI model not ready: Uses heuristic recognition immediately
  // - If feature extraction fails: Falls back to heuristic recognition
  // - If prediction confidence < 60%: Falls back to heuristic recognition
  // - This ensures robust recognition even when AI model is unavailable
  //
  // Returns: { type: string, confidence: number (0-1), features: shapeObject } or null
  recognizeShape(points) {
    // If AI not ready or features invalid, try heuristic fallback
    if (!this.isReady) {
      const h = this.heuristicRecognize(points);
      return h ? { type: h.type, confidence: 0.5, features: h } : null;
    }
    const f = this.extractFeatures(points);
    if (!f) {
      const h = this.heuristicRecognize(points);
      return h ? { type: h.type, confidence: 0.5, features: h } : null;
    }
    const probs = this.predictProbs(f);
    
    // If probabilities are null, use heuristic fallback
    if (!probs) {
      const h = this.heuristicRecognize(points);
      return h ? { type: h.type, confidence: 0.5, features: h } : null;
    }
    
    const idx = probs.indexOf(Math.max(...probs));
    const type = this.shapeClasses[idx];
    const confidence = probs[idx];
    // Prefer AI result, but if geometry is too tiny fallback to heuristic geometry
    const features =
      this.convertToShape(points, type) || this.heuristicRecognize(points);
    return {
      type,
      confidence,
      features,
    };
  }

  convertToShape(points, type) {
    // ============================================================================
    // SHAPE RECOGNITION: CONVERT TO PERFECT GEOMETRIC SHAPE
    // ============================================================================
    // This method converts a recognized shape type to a perfect geometric representation:
    // 
    // SHAPE CONVERSIONS:
    // - Line: Two points (start and end of bounding box diagonal)
    // - Circle: Center point (x, y) and radius (half of smaller dimension)
    // - Square: Top-left corner (x, y) and side length (smaller dimension)
    // - Rectangle: Top-left corner (x, y) and dimensions (width, height)
    // - Triangle: Three vertices forming equilateral triangle (base at bottom, apex at top)
    // - Hexagon: Six vertices evenly spaced around a circle (regular hexagon)
    // - Pentagon: Five vertices evenly spaced around a circle (regular pentagon, starts at top)
    //
    // The conversion uses extracted features to calculate precise geometric properties,
    // replacing rough hand-drawn strokes with perfect mathematical shapes.
    //
    // Returns: Object with shape type and geometric properties, or null if conversion fails
    const f = this.extractFeatures(points); // Reuse features
    if (!f) return null;

    const centerX = f.minX + f.width / 2;
    const centerY = f.minY + f.height / 2;
    const avgRadius = Math.min(f.width, f.height) / 2;

    if (type === "line") {
      return {
        type: "line",
        points: [f.startX, f.startY, f.endX, f.endY],
      };
    }
    if (type === "circle") {
      return {
        type: "circle",
        x: centerX,
        y: centerY,
        radius: avgRadius,
      };
    }
    if (type === "square") {
      const side = Math.min(f.width, f.height);
      return { type: "square", x: f.minX + (f.width - side) / 2, y: f.minY + (f.height - side) / 2, side };
    }
    if (type === "triangle") {
      // Equilateral triangle: base at bottom, apex at top
      const baseY = f.maxY;
      const apexY = f.minY;
      return {
        type: "triangle",
        points: [
          f.minX, baseY,           // bottom-left
          f.maxX, baseY,           // bottom-right
          (f.minX + f.maxX) / 2, apexY  // top apex
        ],
      };
    }
    if (type === "hexagon") {
      // Regular hexagon points
      const radius = Math.min(f.width, f.height) / 2;
      const points_hex = [];
      for (let i = 0; i < 6; i++) {
        const angle = (i * 2 * Math.PI) / 6;
        points_hex.push(centerX + radius * Math.cos(angle));
        points_hex.push(centerY + radius * Math.sin(angle));
      }
      return {
        type: "hexagon",
        points: points_hex,
      };
    }
    if (type === "pentagon") {
      // Regular pentagon points
      const radius = Math.min(f.width, f.height) / 2;
      const points_pent = [];
      for (let i = 0; i < 5; i++) {
        const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2; // Start at top
        points_pent.push(centerX + radius * Math.cos(angle));
        points_pent.push(centerY + radius * Math.sin(angle));
      }
      return {
        type: "pentagon",
        points: points_pent,
      };
    }
    // rectangle (default)
    return {
      type: "rectangle",
      x: f.minX,
      y: f.minY,
      width: f.width,
      height: f.height,
    };
  }
  
  // ============================================================================
  // SHAPE RECOGNITION: HEURISTIC FALLBACK SYSTEM
  // ============================================================================
  // This method provides a geometric fallback when AI model confidence is low:
  // 
  // IMPROVEMENTS MADE:
  // 1. Strict Corner Matching:
  //    - Uses exact corner count (rounded) for precise shape identification
  //    - Triangle: Exactly 3 corners, closed, convex, low circularity
  //    - Square: 4 corners, right angles (>60% score), aspect ratio <= 1.2, high squareness
  //    - Rectangle: 4 corners, right angles, aspect ratio > 1.3 OR low squareness
  //    - Pentagon: Exactly 5 corners, closed, convex, moderate circularity
  //    - Hexagon: Exactly 6 corners, closed, convex, moderate circularity
  //    - Circle: High circularity (>85%), closed, minimal corners (<2)
  //
  // 2. Line Detection:
  //    - Not closed, high aspect ratio (>4), low straightness (<1.5), minimal corners
  //
  // 3. Shape Quality Filters:
  //    - Filters out shapes that are too small (<15px width/height for closed shapes)
  //    - Requires minimum feature quality for recognition
  //
  // This fallback ensures the system always provides shape recognition even when
  // the AI model is unavailable or produces low-confidence results.
  //
  // Returns: Perfect geometric shape object or null if shape cannot be recognized
  // Enhanced heuristic fallback with strict corner matching
  heuristicRecognize(points) {
    const f = this.extractFeatures(points);
    if (!f) return null;

    const centerX = f.minX + f.width / 2;
    const centerY = f.minY + f.height / 2;
    const exactCorners = Math.round(f.corners);

    // Line detection
    if (!f.isClosed && f.aspect > 4 && f.straightness < 1.5 && exactCorners < 2) {
      return {
        type: "line",
        points: [f.startX, f.startY, f.endX, f.endY],
      };
    }
    
    if (f.isClosed) {
      // Triangle
      if (exactCorners === 3 && f.circularity < 0.5 && f.isConvex) {
        const baseY = f.maxY;
        const apexY = f.minY;
        return {
          type: "triangle",
          points: [
            f.minX, baseY,
            f.maxX, baseY,
            (f.minX + f.maxX) / 2, apexY
          ],
        };
      }
      
      // 4-corner shapes - prefer right angles
      if (exactCorners === 4 && f.circularity < 0.4) {
        if (f.rightAngleScore > 0.6 && f.aspect <= 1.2 && f.squareness > 0.9) {
          const side = Math.min(f.width, f.height);
          return {
            type: "square",
            x: f.minX + (f.width - side) / 2,
            y: f.minY + (f.height - side) / 2,
            side,
          };
        }
        if (f.rightAngleScore > 0.6 && (f.aspect > 1.3 || f.squareness < 0.8)) {
          return {
            type: "rectangle",
            x: f.minX,
            y: f.minY,
            width: f.width,
            height: f.height,
          };
        }
      }

      // Pentagon
      if (exactCorners === 5 && f.circularity < 0.8 && f.isConvex) {
        const radius = Math.min(f.width, f.height) / 2;
        const points_pent = [];
        for (let i = 0; i < 5; i++) {
          const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
          points_pent.push(centerX + radius * Math.cos(angle));
          points_pent.push(centerY + radius * Math.sin(angle));
        }
        return {
          type: "pentagon",
          points: points_pent,
        };
      }
      
      // Hexagon
      if (exactCorners === 6 && f.circularity < 0.8 && f.isConvex) {
        const radius = Math.min(f.width, f.height) / 2;
        const points_hex = [];
        for (let i = 0; i < 6; i++) {
          const angle = (i * 2 * Math.PI) / 6;
          points_hex.push(centerX + radius * Math.cos(angle));
          points_hex.push(centerY + radius * Math.sin(angle));
        }
        return {
          type: "hexagon",
          points: points_hex,
        };
      }

      // Circle
      if (f.circularity > 0.85 && exactCorners < 2) {
        const radius = Math.min(f.width, f.height) / 2;
        return {
          type: "circle",
          x: centerX,
          y: centerY,
          radius,
        };
      }
    }
    
    return null;
  }
}

const aiShapeRecognition = new MinimalAIShapeRecognition();
export default aiShapeRecognition;