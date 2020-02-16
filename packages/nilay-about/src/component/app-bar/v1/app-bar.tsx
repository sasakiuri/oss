import * as React from 'react'
import { Link } from 'react-router-dom'
import AppBar from '@material-ui/core/AppBar'
import Tabs from '@material-ui/core/Tabs'
import Tab from '@material-ui/core/Tab'
import Container from '@material-ui/core/Container'
import styled from "styled-components"

interface Props { }

interface State {
    value: number
}

const StyledAppBar = styled(AppBar)`
 & {
  background: #fff;
}
`

const StyledTabs = styled(({ className, ...other }) => {
    return <Tabs {...other} classes={{ indicator: className }} />;
})`
& {
    background: rgb(232, 118, 0);
    &:hover {
        background: red;
    }
}
`

const StyledTab = styled(({ ...props }) => (
    <Tab {...props} classes={{ selected: "selected" }} />
))``;

class Component extends React.Component<Props, State> {

    public constructor(props: Props) {
        super(props);
        this.state = { value: 0 }
    } public handleChange = (event: React.ChangeEvent<{}>, newValue: number) => {
        this.setState({ value: newValue })
    };

    public render(): React.ReactNode {
        return (
            <StyledAppBar position="sticky">
                <Container maxWidth="lg">
                    <StyledTabs
                        value={this.state.value}
                        onChange={this.handleChange}
                        variant="scrollable"
                        scrollButtons="off"
                        indicatorColor="primary"
                        textColor="primary"
                        aria-label="nav tabs example">
                        <StyledTab component={Link} value={0} label="Nilay/About" to="/" />
                        <StyledTab component={Link} value={1} label="ニュース" to="/news" />
                        <StyledTab component={Link} value={2} label="お問い合わせ" to="/contact" />
                    </StyledTabs>
                </Container>
            </StyledAppBar>
        );
    }
}

export default Component