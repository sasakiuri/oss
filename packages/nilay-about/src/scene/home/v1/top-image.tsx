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
        <img src={this.props.src} alt={this.props.alt} />
      </div>
    );
  }
}
const StyledComponent = styled(Component)`
  margin: 3rem 0;
`;

export default StyledComponent;
