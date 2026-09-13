<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hand Tracking 3D Particle System</title>
    <style>
        body { margin: 0; overflow: hidden; background-color: #000; color: white; font-family: sans-serif; }
        canvas { display: block; }
        #videoElement { display: none; }
        #ui { position: absolute; top: 10px; left: 10px; z-index: 10; pointer-events: none; background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px; }
        .highlight { color: #00ffcc; font-weight: bold; }
    </style>
    <!-- Three.js -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
    <!-- MediaPipe -->
    <script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js" crossorigin="anonymous"></script>
    <script src="https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js" crossorigin="anonymous"></script>
</head>
<body>

    <div id="ui">
        <h2>Interactive Particles</h2>
        <p>✋ Show your hand to the camera</p>
        <p>🤏 <span class="highlight">Thumb + Index</span>: Scale/Expand</p>
        <p>🤘 <span class="highlight">Thumb + Pinky</span>: Change Shape</p>
        <p>Current Shape: <span id="shapeName" class="highlight">Sphere</span></p>
    </div>

    <video id="videoElement" autoplay playsinline></video>
    <div id="canvasContainer"></div>

    <script>
        // --- 1. THREE.JS SETUP ---
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.z = 50;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.getElementById('canvasContainer').appendChild(renderer.domElement);

        // Particle System Variables
        const particleCount = 10000;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        const targetPositions = new Float32Array(particleCount * 3); // For morphing
        
        let particleSystem;
        let shapes = [];
        let currentShapeIndex = 0;
        let lastShapeChangeTime = 0;

        // --- 2. SHAPE GENERATORS ---
        function getSphere(count, radius) {
            const pos = new Float32Array(count * 3);
            for (let i = 0; i < count; i++) {
                const u = Math.random();
                const v = Math.random();
                const theta = u * 2.0 * Math.PI;
                const phi = Math.acos(2.0 * v - 1.0);
                const r = Math.cbrt(Math.random()) * radius; // Volume distribution
                pos[i*3] = r * Math.sin(phi) * Math.cos(theta);
                pos[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
                pos[i*3+2] = r * Math.cos(phi);
            }
            return pos;
        }

        function getHeart(count, scale) {
            const pos = new Float32Array(count * 3);
            for (let i = 0; i < count; i++) {
                const t = Math.random() * Math.PI * 2;
                const x = 16 * Math.pow(Math.sin(t), 3);
                const y = 13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t);
                const z = (Math.random() - 0.5) * 5; 
                pos[i*3] = x * scale;
                pos[i*3+1] = y * scale;
                pos[i*3+2] = z * scale;
            }
            return pos;
        }

        function getFlower(count, scale) {
            const pos = new Float32Array(count * 3);
            for (let i = 0; i < count; i++) {
                const t = Math.random() * Math.PI * 2;
                const r = Math.sin(4 * t) * scale * 20; // Rose curve
                pos[i*3] = r * Math.cos(t) + (Math.random() - 0.5) * 2;
                pos[i*3+1] = r * Math.sin(t) + (Math.random() - 0.5) * 2;
                pos[i*3+2] = (Math.random() - 0.5) * 5;
            }
            return pos;
        }

        function getSaturn(count, scale) {
            const pos = new Float32Array(count * 3);
            for (let i = 0; i < count; i++) {
                if (i < count / 3) { // Planet
                    const u = Math.random(), v = Math.random();
                    const theta = u * 2.0 * Math.PI, phi = Math.acos(2.0 * v - 1.0);
                    pos[i*3] = 10 * scale * Math.sin(phi) * Math.cos(theta);
                    pos[i*3+1] = 10 * scale * Math.sin(phi) * Math.sin(theta);
                    pos[i*3+2] = 10 * scale * Math.cos(phi);
                } else { // Rings
                    const angle = Math.random() * Math.PI * 2;
                    const radius = 15 * scale + Math.random() * 10 * scale;
                    pos[i*3] = Math.cos(angle) * radius;
                    pos[i*3+1] = (Math.random() - 0.5) * 2; // Flat ring
                    pos[i*3+2] = Math.sin(angle) * radius;
                }
            }
            return pos;
        }

        function getFireworks(count, scale) {
            const pos = new Float32Array(count * 3);
            for (let i = 0; i < count; i++) {
                const r = Math.random() * 40 * scale;
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.random() * Math.PI;
                pos[i*3] = r * Math.sin(phi) * Math.cos(theta);
                pos[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
                pos[i*3+2] = r * Math.cos(phi);
            }
            return pos;
        }

        // Initialize Shapes Array
        const shapeNames = ["Sphere", "Heart", "Flower", "Saturn", "Fireworks"];
        shapes.push(getSphere(particleCount, 20));
        shapes.push(getHeart(particleCount, 1.2));
        shapes.push(getFlower(particleCount, 1));
        shapes.push(getSaturn(particleCount, 1.5));
        shapes.push(getFireworks(particleCount, 1.5));

        // Initial setup
        for (let i = 0; i < particleCount * 3; i++) {
            positions[i] = (Math.random() - 0.5) * 100; // Start random
            targetPositions[i] = shapes[0][i];
            colors[i] = Math.random();
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.5,
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending
        });

        particleSystem = new THREE.Points(geometry, material);
        scene.add(particleSystem);

        // --- 3. MEDIAPIPE HAND TRACKING SETUP ---
        const videoElement = document.getElementById('videoElement');
        let handX = 0, handY = 0;
        let targetScale = 1;
        let baseHue = 0.5;

        const hands = new Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.7,
            minTrackingConfidence: 0.7
        });

        hands.onResults((results) => {
            if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
                const landmarks = results.multiHandLandmarks[0];
                
                // Track hand center (using wrist/palm)
                handX = (landmarks[9].x - 0.5) * 2;
                handY = -(landmarks[9].y - 0.5) * 2;

                // Points for gestures
                const thumbTip = landmarks[4];
                const indexTip = landmarks[8];
                const pinkyTip = landmarks[20];

                // --- GESTURE 1: Expansion (Thumb + Index distance) ---
                const distIndex = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
                // Map distance (approx 0.02 to 0.3) to Scale (0.5 to 3)
                targetScale = Math.max(0.5, Math.min(3, distIndex * 10));

                // --- GESTURE 2: Change Template (Thumb + Pinky pinch) ---
                const distPinky = Math.hypot(thumbTip.x - pinkyTip.x, thumbTip.y - pinkyTip.y);
                const now = Date.now();
                if (distPinky < 0.05 && now - lastShapeChangeTime > 1000) {
                    currentShapeIndex = (currentShapeIndex + 1) % shapes.length;
                    document.getElementById('shapeName').innerText = shapeNames[currentShapeIndex];
                    
                    // Update target positions to new shape
                    for (let i = 0; i < particleCount * 3; i++) {
                        targetPositions[i] = shapes[currentShapeIndex][i];
                    }
                    lastShapeChangeTime = now;
                }

                // Dynamic Color based on Hand Z depth (approximated by hand size)
                baseHue = (handX + 1) / 2; // Map X position to Hue
            }
        });

        const cameraFeed = new Camera(videoElement, {
            onFrame: async () => { await hands.send({ image: videoElement }); },
            width: 640,
            height: 480
        });
        cameraFeed.start();

        // --- 4. ANIMATION LOOP ---
        function animate() {
            requestAnimationFrame(animate);

            // Smooth Morphing (Lerp positions)
            const posAttribute = particleSystem.geometry.attributes.position;
            const colAttribute = particleSystem.geometry.attributes.color;
            const positionsArr = posAttribute.array;
            const colorsArr = colAttribute.array;

            const colorObj = new THREE.Color();
            
            // Handle Fireworks Special Effect (bursting behavior)
            let isFireworks = shapeNames[currentShapeIndex] === "Fireworks";

            for (let i = 0; i < particleCount * 3; i+=3) {
                // Morph Position
                positionsArr[i] += (targetPositions[i] - positionsArr[i]) * 0.05;
                positionsArr[i+1] += (targetPositions[i+1] - positionsArr[i+1]) * 0.05;
                positionsArr[i+2] += (targetPositions[i+2] - positionsArr[i+2]) * 0.05;

                // Fireworks reset logic (continuous explosion)
                if (isFireworks && Math.random() < 0.01) {
                    positionsArr[i] = 0; positionsArr[i+1] = 0; positionsArr[i+2] = 0;
                    targetPositions[i] = shapes[4][i]; targetPositions[i+1] = shapes[4][i+1]; targetPositions[i+2] = shapes[4][i+2];
                }

                // Update Colors dynamically based on hand position + local particle position
                const individualHue = (baseHue + (positionsArr[i] * 0.01)) % 1.0;
                colorObj.setHSL(individualHue, 0.8, 0.6);
                colorsArr[i] = colorObj.r;
                colorsArr[i+1] = colorObj.g;
                colorsArr[i+2] = colorObj.b;
            }

            posAttribute.needsUpdate = true;
            colAttribute.needsUpdate = true;

            // Apply interactive Rotation and Scaling
            particleSystem.rotation.y += (handX * 2 - particleSystem.rotation.y) * 0.1;
            particleSystem.rotation.x += (handY * 2 - particleSystem.rotation.x) * 0.1;
            particleSystem.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);

            // Continual slow rotation
            particleSystem.rotation.y += 0.002;

            renderer.render(scene, camera);
        }

        animate();

        // Handle window resize
        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });
    </script>
</body>
</html>
      
