import * as React from "react"
import styled from "styled-components"
import Img, { FluidObject } from "gatsby-image"

type Props = {
  className?: string
  alt: string
  href: string
  src: FluidObject | Array<FluidObject>
}

const Component: React.FC<Props> = (props: Props) => {
  return (
    <div className={props.className}>
      <a href={props.href} target="_blank" rel="noopener noreferrer">
        <Img fluid={props.src} alt={props.alt} />
      </a>
    </div>
  )
}

const StyledComponent = styled(Component)`
  display: flex;
  justify-content: center;
  margin: 3rem 0;
  & > a {
    display: block;
    max-width: 100%;
    min-width: 200px;
    ali & > img {
      display: block;
      width: 100%;
    }
  }
`

export const HomeImage = StyledComponent
