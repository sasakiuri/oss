import * as React from 'react';

class Footer extends React.Component {
    public render(): React.ReactNode {
        return (
            <footer className="bg-light text-dark l_footer">
                <div className="container py-3">
                    <div className="row">
                        <div className="col-12 h2">
                            <a href="https://www.facebook.com/NilaySport/" target="_blank" className="text-dark"><i className="fab fa-facebook-square"></i></a>&nbsp;
                            <a href="https://twitter.com/NilayJP" target="_blank" className="text-dark"><i className="fab fa-twitter"></i></a>&nbsp;
                            <a href="https://www.youtube.com/channel/UC03yJGn_rZV2MTpr-ZrMZrA" target="_blank" className="text-dark"><i className="fab fa-youtube"></i></a>&nbsp;
                            <a href="https://www.instagram.com/NilayJP/" target="_blank" className="text-dark"><i className="fab fa-instagram"></i></a>
                        </div>
                        <hr className="divider" />
                        <div className="col-6 col-sm-3 text-left">
                            <h5>Nilay/About</h5>
                        </div>
                        <div className="col-6 col-sm-3 text-left">
                            <h5>サービス</h5>
                            <div className="pl-3">Knowledge</div>
                            <div className="pl-3">E-commerce</div>
                            <div className="pl-3">Gunman</div>
                        </div>
                        <hr className="divider" />
                        <div className="col-12 small"><small>© 2019 Nilay</small></div>
                    </div>
                </div>
            </footer>
        );
    }
}

export default Footer;