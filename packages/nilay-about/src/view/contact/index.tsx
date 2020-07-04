import React, { useState } from "react"
import styled from "styled-components"

export * from "./form"
export const Scene = styled.div`
  text-align: left;
  margin-top: 2rem;
  @font-face {
    font-family: "Original Yu Gothic";
    src: local("Yu Gothic Medium");
    font-weight: 100;
  }
  @font-face {
    font-family: "Original Yu Gothic";
    src: local("Yu Gothic Medium");
    font-weight: 200;
  }
  @font-face {
    font-family: "Original Yu Gothic";
    src: local("Yu Gothic Medium");
    font-weight: 300;
  }
  @font-face {
    font-family: "Original Yu Gothic";
    src: local("Yu Gothic Medium");
    font-weight: 400;
  }
  @font-face {
    font-family: "Original Yu Gothic";
    src: local("Yu Gothic Bold");
    font-weight: bold;
  }
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "Hiragino Sans", "Noto Sans CJK JP", "Original Yu Gothic", "Yu Gothic",
    sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol",
    "Noto Sans Emoji";
`

export const SocialLink = styled.a`
  diplay: inline-block;
  line-height: 48px;
  height: 48px;
  width: 48px;
  text-align: centerl;
  & + & {
    margin-left: 1rem;
  }
  color: #2c3e50;
  &: hover {
    color: #2c3e50;
  }
`

export const ContactAddress = styled.a`
  display: block;
  line-height: 36px;
  height: 36px;
  margin: 0;
  width: 100%;
  text-align: left;
  color: #2c3e50;
  font-size: 1rem;
  text-decoration: none;
  color: #2c3e50;
  &: hover {
    color: #2c3e50;
  }
`

const Component: React.FC<Props> = (props: Props) => {
  const [count, setCount] = useState(0)
  return (
    <div>
      <p>You clicked {count} times</p>
      <button onClick={() => setCount(count + 1)}>Click me</button>
    </div>
  )
}

export const Test = Component
