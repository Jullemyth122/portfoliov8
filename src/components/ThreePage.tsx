import { useGSAP } from '@gsap/react';
import { Environment, GradientTexture, MeshTransmissionMaterial, OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber'
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/all';
import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { SpotLight } from 'three';
import * as THREE from 'three'

interface SceneProps {
  containerRef: React.RefObject<any>;
  leftTitleRef: React.RefObject<HTMLDivElement | null>;
  rightTitleRef: React.RefObject<HTMLDivElement | null>;
}

function OuterBox() {
    return (
        <mesh castShadow receiveShadow>
        <boxGeometry args={[3, 3, 3]} />
        <MeshTransmissionMaterial
            color={0xffffff}
            transmission={1}
            thickness={0.5}
            ior={1.5}
            attenuationDistance={2}
            attenuationColor={new THREE.Color(0xffffff)}
            roughness={0.2}
            samples={10}
            resolution={512}
            chromaticAberration={0.02}
            anisotropy={0.5}
            distortion={0.1}
            distortionScale={0.3}
            side={THREE.DoubleSide}
        />

        </mesh>
    )
}

function InnerBox() {
    return (
        <mesh castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial>
                <GradientTexture
                    stops={[0, 0.5, 1]}                // Positions for the gradient stops (0 to 1)
                    // colors={['red', 'orange', 'yellow']} // Colors at each stop
                    colors={['#033dfc', '#297eff', '#8cb8fa']} // Colors at each stop
                    size={1024}                        // Resolution of the gradient texture
                />
            </meshBasicMaterial>
        </mesh>
    )
}

export function usePerfectRing(
  zoomEnd: THREE.Vector3,
  tiltX: number = Math.PI / 6,
  segments: number = 200
) {
  return useMemo(() => {
    const radius   = zoomEnd.length();
    const startAng = Math.atan2(zoomEnd.z, zoomEnd.x);

    // 1) build circle in XZ-plane
    const raw: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const θ = startAng + t * Math.PI * 2;
      raw.push(new THREE.Vector3(
        Math.cos(θ) * radius,
        0,
        Math.sin(θ) * radius
      ));
    }

    // 2) tilt around X-axis
    const q = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0), tiltX
    );
    const tilted = raw.map(p => p.clone().applyQuaternion(q));

    // 3) figure out offset so tilted[0] → zoomEnd
    const offset = zoomEnd.clone().sub(tilted[0]);

    // 4) translate all tilted points by offset
    const slanted = tilted.map(p => p.clone().add(offset));

    // 5) return a closed Catmull–Rom for smooth looping
    return new THREE.CatmullRomCurve3(slanted, true);
  }, [zoomEnd, tiltX, segments]);
}

const Scene: React.FC<SceneProps> = ({ containerRef, leftTitleRef, rightTitleRef }) => {
    const rimLightRef = useRef<SpotLight | null>(null);

    useEffect(() => {
        if (rimLightRef.current) {
            rimLightRef.current.lookAt(0, 0, 0);
        }
    }, []);

    const { camera } = useThree();
    const zoomEnd = new THREE.Vector3(3, -3, 3);

    // 2) Build a ring that *starts* at zoomEnd
    const ringCurve = usePerfectRing(zoomEnd, Math.PI / 6, 300);
    const proxy     = useRef({ t: 0 });

    // Use the useGSAP hook for better context and cleanup
    useGSAP(() => {
        const tl = gsap.timeline({
            scrollTrigger: {
                trigger: containerRef.current, // This is .three_page-comp
                start: 'top top',
                // The pin will make the page scrollable for 300% of the viewport height
                // while this element is pinned.
                end: '+=300%', 
                scrub: 1,
                pin: true, 
                // pinSpacing: true, // This is the default and usually correct
                // markers: true, // Keep for debugging
            }
        });

        // The rest of your timeline logic is great and can stay the same
        gsap.set([leftTitleRef.current, rightTitleRef.current], { display: 'normal' });
        tl.from(leftTitleRef.current, { opacity: 0, y: -50, duration: 0.3 }, 0);
        tl.from(rightTitleRef.current, { opacity: 0, y: 50, duration: 0.3 }, 0);
        tl.to(leftTitleRef.current, { x: -100, opacity: 0.8, ease: 'power1.out', duration: 0.4 }, 0);
        tl.to(rightTitleRef.current, { x: 100, opacity: 0.8, ease: 'power1.out', duration: 0.4 }, 0);
        tl.to([leftTitleRef.current, rightTitleRef.current], { opacity: 0, y: ({ index }: any) => index === 0 ? -20 : 20, ease: 'power1.in', duration: 0.4 }, 0.4);
        tl.to(camera.position, { x: zoomEnd.x, y: zoomEnd.y, z: zoomEnd.z, ease: 'power1.inOut', duration: 0.4, onUpdate: () => camera.lookAt(0, 0, 0) }, 0);
        tl.to(proxy.current, { t: 1, ease: 'none', duration: 0.6, onUpdate: () => {
            const pos = ringCurve.getPoint(proxy.current.t);
            camera.position.copy(pos);
            camera.lookAt(0, 0, 0);
        }}, 0.3);

    }, { scope: containerRef }); // Scope animations to the container

    return(
        <>
            <ambientLight intensity={1.0} color="#ffffff" />
            <Environment preset="city" background={false} />

            <directionalLight
                castShadow
                intensity={0.5}
                position={[0, 9, 2]}
                color="#ffffff"
                shadow-mapSize-width={2048}
                shadow-mapSize-height={2048}
                shadow-radius={2}
                shadow-bias={-0.0001}
            />

            {/* Rim light for edge highlights */}
            <spotLight
                intensity={0.3}
                position={[0, 5, -10]}
                angle={Math.PI / 4}
                penumbra={1}
                color="#ffffff"
            />

            {/* Rim light: Backlight for edge highlights */}
            
            <spotLight
                ref={rimLightRef}
                intensity={0.3}
                position={[0, 5, -10]}
                angle={Math.PI / 4}
                penumbra={1}
                color="#ffffff"
            />

            <OuterBox />
            <InnerBox />
        </>
    )
}

const ThreePage = () => {
    
    const threePageCompRef = useRef<HTMLDivElement | null>(null); // Ref for the element to be pinned
    const leftTitleRef = useRef<HTMLDivElement | null>(null);
    const rightTitleRef = useRef<HTMLDivElement | null>(null);

    useLayoutEffect(() => {
        gsap.set([leftTitleRef.current,rightTitleRef.current],{
            opacity:0,
        })
    },[])

    return (
        // This wrapper no longer needs a massive fixed height. Its height will be
        // determined by its content (100vh) + the space created by the pin.
        <div className="three-wrapper"> 
            {/* This is the element that will be pinned and scrolled through */}
            <div 
                ref={threePageCompRef} 
                className='three_page-comp' 
                style={{ position: 'relative', height: '100vh', width: '100%' }} // Ensure it takes up viewport
            >
                <div ref={leftTitleRef} className="title_lt_side">
                    <h1>Aspiring Web <br/> Developer</h1>
                    <h1 className='font-bold absolute'>Aspiring Web <br/> Developer</h1>
                </div>
                <div ref={rightTitleRef} className="title_rt_side">
                    <h1>Aspiring Software <br/> Engineer</h1>
                    <h1 className='font-bold absolute'>Aspiring Software <br/> Engineer</h1>
                </div>
                <Canvas camera={{ position:[1.10,-1.10,1.10] }} shadows gl={{ antialias: true }}>
                    {/* Pass the ref of the element to be pinned */}
                    <Scene containerRef={threePageCompRef} leftTitleRef={leftTitleRef} rightTitleRef={rightTitleRef}/>
                </Canvas>
            </div>
        </div>
    );

}

export default ThreePage