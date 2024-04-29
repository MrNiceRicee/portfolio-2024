import {  useEffect, useReducer, useState } from "react";

import sillyGuyEyesOpenMouthClosed from "../assets/silly-guy/eyes_open_mouth_closed.webp";
import sillyGuyEyesOpenMouthOpen from "../assets/silly-guy/eyes_open_mouth_open.webp";
import sillyGuyEyesClosedMouthClosed from "../assets/silly-guy/eyes_closed_mouth_closed.webp";
import sillyGuyEyesClosedMouthOpen from "../assets/silly-guy/eyes_closed_mouth_open.webp";

type BlinkingState = "closed" | "open";
type TalkingState = "closed" | "open";

interface SillyGuy {
  blinking: BlinkingState;
  talking: TalkingState;
}

type SillyGuyAction = { type: "blink" } | { type: "talk", nextTalkState: TalkingState };
const sillyGuyActionReducer = (state: SillyGuy, action: SillyGuyAction): SillyGuy => {
  switch (action.type) {
    case "blink":
      return {
        ...state,
        blinking: state.blinking === "closed" ? "open" : "closed",
      };
    case "talk":
      return {
        ...state,
        talking: action.nextTalkState,
      };
    default:
      return state;
  }
}
// blink durations
const minOpenBlinkDuration = 1; // roughly 100ms
const maxOpenBlinkDuration = 95; // roughly 9.5s
const minClosedBlinkDuration = 1; // roughly 100ms
const maxClosedBlinkDuration = 1; // roughly 200ms 

// talk durations and frequencies
const minOpenTalkDuration = 1; // roughly 100ms
const maxOpenTalkDuration = 3; // roughly 300ms
const minClosedTalkDuration = 1; // roughly 100ms
const maxClosedTalkDuration = 7; // roughly 700ms

const maxConsecutiveTalkOpen = 2; 

const SillyLittleGuy = () => {
  const [state, dispatch] = useReducer(sillyGuyActionReducer, { blinking: "open", talking: "closed" });
  const [talkDuration, setTalkDuration] = useState(2); // each number is a tick
  const [openConsecutiveCount, setOpenConsecutiveCount] = useState(1); 
  const [blinkDuration, setBlinkDuration] = useState(Math.random() * (maxOpenBlinkDuration - minOpenBlinkDuration + 1) + minOpenBlinkDuration);


  useEffect(() => {
    const blinkInterval = setInterval(() => {
      if (blinkDuration <= 0) {
        if (state.blinking === "open") {
          dispatch({ type: "blink" });
          setBlinkDuration(Math.random() * (maxClosedBlinkDuration - minClosedBlinkDuration + 1) + minClosedBlinkDuration);
        } else {
          dispatch({ type: "blink" });
          setBlinkDuration(Math.random() * (maxOpenBlinkDuration - minOpenBlinkDuration + 1) + minOpenBlinkDuration);
        }
      } else {
        setBlinkDuration(prev => prev - 1); 
      }
    }, 100); 

    return () => clearInterval(blinkInterval);
  }, [blinkDuration, state.blinking]);

  useEffect(() => {
    

    const updateTalkDuration = (nextTalkState: TalkingState) => {
      if (nextTalkState === "open") {
        return Math.floor(Math.random() * (maxOpenTalkDuration - minOpenTalkDuration + 1) + minOpenTalkDuration);
      } else {
        return Math.floor(Math.random() * (maxClosedTalkDuration - minClosedTalkDuration + 1) + minClosedTalkDuration);
      }
    };

    const talkInterval = setInterval(() => {
      if (talkDuration <= 0) {
        let nextTalkState: TalkingState;
        if (state.talking === "open" && openConsecutiveCount >= maxConsecutiveTalkOpen) {
          nextTalkState = "closed";
          setOpenConsecutiveCount(0);
        } else {
          nextTalkState = state.talking === "closed" || openConsecutiveCount >= maxConsecutiveTalkOpen ? "open" : Math.random() > 0.5 ? "open" : "closed";
          setOpenConsecutiveCount(nextTalkState === "open" ? openConsecutiveCount + 1 : 0);
        }
        dispatch({ type: "talk", nextTalkState });
        setTalkDuration(updateTalkDuration(nextTalkState));
      } else {
        setTalkDuration((prev) => prev - 1);
      }
    }, 100); 

    return () => {
      clearInterval(talkInterval);
    };
  }, [talkDuration, state.talking, openConsecutiveCount]);




  const determineImageSrc = () => {
    if (state.blinking === "open") {
      if (state.talking === "open") {
        return sillyGuyEyesOpenMouthOpen.src;
      } else {
        return sillyGuyEyesOpenMouthClosed.src;
      }
    } else {
      if (state.talking === "open") {
        return sillyGuyEyesClosedMouthOpen.src;
      } else {
        return sillyGuyEyesClosedMouthClosed.src;
      }
    }
  }

  return (
    <img
      src={determineImageSrc()}
      alt="Joshua Constantine Santos"
      className="rounded-full w-32 h-32 fixed -bottom-[1px] -right-4 object-cover xs:relative xs:bottom-1.5 xs:right-2 xs:mb-[-1.1rem] xs:ml-[10.4rem] z-[1] transition-all duration-300 ease-in-out"
    />
  );
} 

export default SillyLittleGuy;