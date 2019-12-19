import * as React from 'react';

class ContactView extends React.Component {

    public componentDidMount(): void {
        document.title = "お問い合わせ：Nilay/About";
    }

    public render(): React.ReactNode {
        return (
            <div id="ContactView">
                <h1 className="h2">お問い合わせ</h1>
                <div className="container mt-5">
                    <div className="my-3">
                        <div><i className="fas fa-envelope mr-2"></i>Ｅメールアドレス</div>
                        <div>contact@mail.nilay.jp</div>
                    </div>
                    <div className="my-3">
                        <div><i className="fas fa-phone mr-2"></i>電話番号</div>
                        <div>080-7059-1382</div>
                    </div>
                    <div className="h4 my-3">
                        <a href="https://www.facebook.com/NilaySport/"
                            target="_blank"
                            className="text-dark d-inline-block mx-2">
                            <i className="fab fa-facebook-square"></i>
                        </a>
                        <a href="https://twitter.com/NilayJP"
                            target="_blank"
                            className="text-dark d-inline-block mx-2">
                            <i className="fab fa-twitter"></i>
                        </a>
                    </div>
                </div>
            </div>
        );
    }
}

export default ContactView;