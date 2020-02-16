import * as React from "react";
import styled from "styled-components";

interface Props {
  className?: string;
  src: string;
  alt: string;
}

class Component extends React.Component<Props> {
  public constructor(props: Props) {
    super(props);
  }

  public render(): React.ReactNode {
    return (
      <div className={this.props.className}>
        <a
          href="https://www.irasutoya.com/2015/03/blog-post_346.html"
          target="_blank"
          rel="noopener noreferrer"
        >
          <img src={this.props.src} alt={this.props.alt} />
        </a>
      </div>
    );
  }
}
const StyledComponent = styled(Component)`
  display: flex;
  justify-content: center;
  margin: 3rem 0;
  & > a {
    display: block;
    max-width: 100%;
    min-width: 200px;
    ali
    & > img {
      display: block;
      width: 100%;
    }
  }
`;

export default StyledComponent;
