import { useRef, useMemo, useEffect } from 'react';
import { DoubleSide, Object3D, InstancedMesh as ThreeInstancedMesh, BufferGeometry, Material, Group, Box3, Vector3, RepeatWrapping, LinearMipmapLinearFilter, LinearFilter, DataTexture, ShaderMaterial, Color } from 'three';
import { useGLTF, useTexture } from '@react-three/drei';
import { Maze } from '@/types/game';

// Preload models
useGLTF.preload('/models/Roof_Flat_Center.glb');
useGLTF.preload('/models/Ceiling_Light.glb');

interface CellarEnvironmentProps {
  maze: Maze;
  lightsEnabled?: boolean;
  roofEnabled?: boolean;
  roofHeight?: number;
}

// Dark room enclosure with roof and ceiling lights
export const CellarEnvironment = ({ maze, lightsEnabled = true, roofEnabled = true, roofHeight: roofHeightProp = 2.4 }: CellarEnvironmentProps) => {
  const gridHeight = maze.grid.length;
  const gridWidth = maze.grid[0]?.length ?? 0;
  
  const PAD = 1;
  const WALL_HEIGHT = roofHeightProp + 0.4;
  const ROOF_HEIGHT = roofHeightProp;
  
  const minX = -PAD;
  const minZ = -PAD;
  const maxX = gridWidth + PAD;
  const maxZ = gridHeight + PAD;
  const sizeX = maxX - minX;
  const sizeZ = maxZ - minZ;
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;

  const wallColor = '#2a2018';
  const floorColor = '#3a2e22';

  return (
    <group>
      {/* Textured dirt floor */}
      <CellarGround maze={maze} centerX={centerX} centerZ={centerZ} sizeX={sizeX} sizeZ={sizeZ} />
      
      {/* Back wall (north) */}
      <mesh position={[centerX, WALL_HEIGHT / 2, minZ]} receiveShadow>
        <planeGeometry args={[sizeX, WALL_HEIGHT]} />
        <meshStandardMaterial color={wallColor} side={DoubleSide} roughness={0.95} />
      </mesh>
      
      {/* Front wall (south) */}
      <mesh position={[centerX, WALL_HEIGHT / 2, maxZ]} rotation-y={Math.PI} receiveShadow>
        <planeGeometry args={[sizeX, WALL_HEIGHT]} />
        <meshStandardMaterial color={wallColor} side={DoubleSide} roughness={0.95} />
      </mesh>
      
      {/* Left wall (west) */}
      <mesh position={[minX, WALL_HEIGHT / 2, centerZ]} rotation-y={Math.PI / 2} receiveShadow>
        <planeGeometry args={[sizeZ, WALL_HEIGHT]} />
        <meshStandardMaterial color={wallColor} side={DoubleSide} roughness={0.95} />
      </mesh>
      
      {/* Right wall (east) */}
      <mesh position={[maxX, WALL_HEIGHT / 2, centerZ]} rotation-y={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[sizeZ, WALL_HEIGHT]} />
        <meshStandardMaterial color={wallColor} side={DoubleSide} roughness={0.95} />
      </mesh>
      
      {/* Ceiling slab */}
      <mesh position={[centerX, ROOF_HEIGHT, centerZ]} rotation-x={Math.PI / 2}>
        <planeGeometry args={[sizeX, sizeZ]} />
        <meshStandardMaterial color={wallColor} side={DoubleSide} roughness={0.9} />
      </mesh>
      
      {/* Roof tiles (instanced) */}
      {roofEnabled && <InstancedRoofTiles gridWidth={gridWidth} gridHeight={gridHeight} roofHeight={ROOF_HEIGHT} />}
      
      {/* Ceiling lights (instanced) */}
      {lightsEnabled && <InstancedCellarLights maze={maze} roofHeight={ROOF_HEIGHT} />}
    </group>
  );
};

// Instanced roof tiles using imperative THREE.js
const InstancedRoofTiles = ({ gridWidth, gridHeight, roofHeight }: { gridWidth: number; gridHeight: number; roofHeight: number }) => {
  const groupRef = useRef<Group>(null);
  const createdRef = useRef(false);
  const { scene } = useGLTF('/models/Roof_Flat_Center.glb');

  const tiles = useMemo(() => {
    const result: { x: number; z: number }[] = [];
    for (let x = -1; x < gridWidth + 1; x += 2) {
      for (let z = -1; z < gridHeight + 1; z += 2) {
        result.push({ x: x + 1, z: z + 1 });
      }
    }
    return result;
  }, [gridWidth, gridHeight]);

  // Extract mesh parts
  const meshParts = useMemo(() => {
    const parts: { geometry: BufferGeometry; material: Material }[] = [];
    scene.traverse((child: any) => {
      if (child.isMesh) {
        parts.push({
          geometry: child.geometry.clone(),
          material: child.material.clone(),
        });
      }
    });
    console.log('[CELLAR] Roof tile mesh parts:', parts.length);
    return parts;
  }, [scene]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group || createdRef.current || tiles.length === 0 || meshParts.length === 0) return;
    createdRef.current = true;

    const allMeshes: ThreeInstancedMesh[] = [];
    const dummy = new Object3D();

    meshParts.forEach((part) => {
      const mesh = new ThreeInstancedMesh(part.geometry, part.material, tiles.length);

      tiles.forEach((tile, i) => {
        dummy.position.set(tile.x, roofHeight + 0.01, tile.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(0.5);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });

      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      group.add(mesh);
      allMeshes.push(mesh);
    });

    console.log('[CELLAR] Created', allMeshes.length, 'roof tile instanced meshes for', tiles.length, 'tiles');

    return () => {
      allMeshes.forEach(mesh => {
        group.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as Material).dispose();
        mesh.dispose();
      });
      createdRef.current = false;
    };
  }, [tiles, meshParts, roofHeight]);

  return <group ref={groupRef} />;
};

// Instanced ceiling lights using imperative THREE.js + point lights
const InstancedCellarLights = ({ maze, roofHeight }: { maze: Maze; roofHeight: number }) => {
  const groupRef = useRef<Group>(null);
  const createdRef = useRef(false);
  const { scene } = useGLTF('/models/Ceiling_Light.glb');

  const lightPositions = useMemo(() => {
    const positions: { x: number; z: number }[] = [];
    const grid = maze.grid;
    
    // Place a light every 4 cells in open spaces (sparse for performance)
    for (let y = 2; y < grid.length - 1; y += 4) {
      for (let x = 2; x < grid[0].length - 1; x += 4) {
        if (!grid[y][x].isWall) {
          positions.push({ x: x + 0.5, z: y + 0.5 });
        }
      }
    }
    
    console.log('[CELLAR] Ceiling light positions:', positions.length);
    return positions;
  }, [maze]);

  // Extract mesh parts from the ceiling light GLB
  const meshParts = useMemo(() => {
    const parts: { geometry: BufferGeometry; material: Material }[] = [];
    scene.traverse((child: any) => {
      if (child.isMesh) {
        parts.push({
          geometry: child.geometry.clone(),
          material: child.material.clone(),
        });
      }
    });
    
    // Log bounding box to understand model size
    const box = new Box3();
    scene.traverse((child: any) => {
      if (child.isMesh && child.geometry) {
        child.geometry.computeBoundingBox();
        const bb = child.geometry.boundingBox;
        if (bb) { box.expandByPoint(bb.min); box.expandByPoint(bb.max); }
      }
    });
    const size = new Vector3();
    box.getSize(size);
    console.log('[CELLAR] Ceiling light model size:', size.x.toFixed(2), size.y.toFixed(2), size.z.toFixed(2), '| parts:', parts.length);
    
    return parts;
  }, [scene]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group || createdRef.current || lightPositions.length === 0 || meshParts.length === 0) return;
    createdRef.current = true;

    const allMeshes: ThreeInstancedMesh[] = [];
    const dummy = new Object3D();
    const lightScale = 1.0;

    meshParts.forEach((part) => {
      const mesh = new ThreeInstancedMesh(part.geometry, part.material, lightPositions.length);

      lightPositions.forEach((pos, i) => {
        dummy.position.set(pos.x, roofHeight - 0.05, pos.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(lightScale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });

      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      group.add(mesh);
      allMeshes.push(mesh);
    });

    console.log('[CELLAR] Created', allMeshes.length, 'ceiling light instanced meshes for', lightPositions.length, 'lights');

    return () => {
      allMeshes.forEach(mesh => {
        group.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as Material).dispose();
        mesh.dispose();
      });
      createdRef.current = false;
    };
  }, [lightPositions, meshParts, roofHeight]);

  // Point lights for illumination (these must be declarative R3F elements)
  return (
    <group ref={groupRef}>
      {lightPositions.map((pos, i) => (
        <pointLight
          key={`cellar-light-${i}`}
          position={[pos.x, roofHeight - 0.25, pos.z]}
          color="#FFE0A0"
          intensity={10}
          distance={12}
          decay={1.4}
          castShadow={false}
        />
      ))}
    </group>
  );
};

// Cellar ground - stone/dirt floor appropriate for an underground cellar
const CellarGround = ({ maze, centerX, centerZ, sizeX, sizeZ }: { maze: Maze; centerX: number; centerZ: number; sizeX: number; sizeZ: number }) => {
  const dirtTexture = useTexture('/textures/dirt_floor.jpg');
  const rockTexture = useTexture('/textures/ground-rocks.jpg');

  const material = useMemo(() => {
    const mazeWidth = maze.grid[0].length;
    const mazeHeight = maze.grid.length;

    [dirtTexture, rockTexture].forEach(tex => {
      tex.wrapS = RepeatWrapping;
      tex.wrapT = RepeatWrapping;
      tex.minFilter = LinearMipmapLinearFilter;
      tex.magFilter = LinearFilter;
    });

    // Wall map: white = wall (barrel), black = path
    const data = new Uint8Array(mazeWidth * mazeHeight * 4);
    for (let y = 0; y < mazeHeight; y++) {
      for (let x = 0; x < mazeWidth; x++) {
        const idx = (y * mazeWidth + x) * 4;
        const isWall = maze.grid[y][x].isWall ? 255 : 0;
        data[idx] = isWall;
        data[idx + 1] = isWall;
        data[idx + 2] = isWall;
        data[idx + 3] = 255;
      }
    }

    const wallMapTex = new DataTexture(data, mazeWidth, mazeHeight);
    wallMapTex.needsUpdate = true;
    wallMapTex.magFilter = LinearFilter;
    wallMapTex.minFilter = LinearFilter;

    return new ShaderMaterial({
      uniforms: {
        dirtTex: { value: dirtTexture },
        rockTex: { value: rockTexture },
        wallMap: { value: wallMapTex },
        mazeWidth: { value: mazeWidth },
        mazeHeight: { value: mazeHeight },
        tileScale: { value: 2.5 },
        fogColor: { value: new Color('#0a0806') },
        fogDensity: { value: 0.06 },
        fogHeightMax: { value: 2.5 },
      },
      fog: true,
      vertexShader: `
        varying vec3 vWorldPos;
        varying float vFogDepth;
        void main() {
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vFogDepth = -mvPosition.z;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D dirtTex;
        uniform sampler2D rockTex;
        uniform sampler2D wallMap;
        uniform float mazeWidth;
        uniform float mazeHeight;
        uniform float tileScale;
        uniform vec3 fogColor;
        uniform float fogDensity;
        uniform float fogHeightMax;
        varying vec3 vWorldPos;
        varying float vFogDepth;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        void main() {
          vec2 worldUV = vWorldPos.xz;
          vec2 mazeUV = worldUV / vec2(mazeWidth, mazeHeight);
          float isWall = texture2D(wallMap, mazeUV).r;

          float inBounds = step(0.0, mazeUV.x) * step(mazeUV.x, 1.0) *
                          step(0.0, mazeUV.y) * step(mazeUV.y, 1.0);

          // Soft edge between path and wall areas
          float edgeNoise = noise(worldUV * 1.5) * 0.3;
          float wallMask = smoothstep(0.3, 0.7, isWall + edgeNoise);
          wallMask = mix(1.0, wallMask, inBounds);

          // Sample textures
          vec2 texUV = worldUV * tileScale;
          // Path: stone/rock floor - warm cellar tones
          vec3 stoneColor = texture2D(rockTex, texUV).rgb * 0.55 * vec3(1.0, 0.9, 0.75);
          // Under barrels: dark dirt
          vec3 dirtColor = texture2D(dirtTex, texUV * 1.2).rgb * 0.3 * vec3(0.9, 0.8, 0.65);

          // Subtle variation on path
          float variation = noise(worldUV * 2.0 + 200.0) * 0.15;
          stoneColor *= (0.9 + variation);

          // Blend: path areas get stone, wall areas get dark dirt
          vec3 finalColor = mix(stoneColor, dirtColor, wallMask);

          // Fog
          float heightAttenuation = 1.0 - smoothstep(0.0, fogHeightMax, vWorldPos.y);
          float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          fogFactor *= heightAttenuation;
          finalColor = mix(finalColor, fogColor, clamp(fogFactor, 0.0, 1.0));

          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
    });
  }, [maze, dirtTexture, rockTexture]);

  return (
    <mesh position={[centerX, -0.01, centerZ]} rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[sizeX, sizeZ]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
};
