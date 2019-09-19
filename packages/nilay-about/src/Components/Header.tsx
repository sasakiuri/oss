import * as React from 'react';
import { NavLink, Link } from 'react-router-dom';

class Header extends React.Component {
    public render(): React.ReactNode {
        return (
            <nav className="navbar py-0 bg-white l_navbar sticky-top navbar-light navbar-expand mb-5">
                <div className="container"><Link to="/" className="navbar-brand">Nilay/About</Link>
                    <ul className="mr-auto ml-2 nav">
                        <li className="nav-item"><NavLink exact to="/" className="nav-link" activeClassName="is-active">ご案内</NavLink></li>
                        <li className="nav-item"><NavLink to="/news" className="nav-link" activeClassName="is-active">お知らせ</NavLink></li>
                        <li className="nav-item"><NavLink to="/contact" className="nav-link" activeClassName="is-active">お問い合わせ</NavLink></li>
                    </ul>
                </div>
            </nav>
        );
    }
}

export default Header;