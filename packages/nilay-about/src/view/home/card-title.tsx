import * as React from "react"
import styled from "styled-components"

type Props = {
  className?: string
  children?: React.ReactNode
}

const Component: React.FC<Props> = (props: Props) => {
  return <div className={props.className}>{props.children}</div>
}

const StyledComponent = styled(Component)`
  font-size: 1.5rem;
  color: rgba(0, 0, 0, 0.5);
  font-weight: 500;
  text-align: center;
  line-height: 1;
  width: 100%;
  margin: 1rem 0;
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

export const CardTitle = StyledComponent
