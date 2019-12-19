import * as React from 'react';

import tanuki from '../Resources/0db7cad9ab39158b8ca1e2c3dd3e144dfa67c852.26a46334.png';

class HomeView extends React.Component {

    public componentDidMount(): void {
        document.title = "Nilay/About";
    }

    public render(): React.ReactNode {
        return (
            <div className="home">
                <a target="_blank" href="https://www.irasutoya.com/2015/03/blog-post_346.html">
                    <img alt="こんにちは，タヌキです。" src={tanuki} />
                </a>
                <div className="h1">ようこそ！！</div>
                <div className="container">

                    <div className="row mt-5">
                        <div className="col-12">
                            <h2>サービス</h2>
                        </div>
                        <div className="col-12 col-md-4 my-5">
                            <div>
                                <i className="fas fa-book text-black-50"></i>
                            </div>
                            <h3 className="text-black-50">Knowledge</h3>
                            <p className="text-left">銃・射撃・狩猟に関する知識を紹介しています。</p>
                            <a rel="noopener" target="_blank" href="https://knowledge.nilay.jp" className="btn btn-outline-dark">読む</a>
                        </div>
                        <div className="col-12 col-md-4 my-5">
                            <div>
                                <i className="fas fa-shopping-cart text-black-50"></i>
                            </div>
                            <h3 className="text-black-50">E-commerce</h3>
                            <p className="text-left">射撃用品・狩猟用品・鳥獣被害対策用品を販売しています。</p>
                            <a rel="noopener" target="_blank" href="https://www.nilay.jp" className="btn btn-outline-dark">買う</a>
                        </div>
                        <div className="col-12 col-md-4 my-5">
                            <div>
                                <i className="fas fa-cloud text-black-50"></i>
                            </div>
                            <h3 className="text-black-50">Gunman</h3>
                            <p className="text-left">申請書・申込書・各種添付書類を作成することができます。</p>
                            <button type="button" disabled={true} className="btn btn-outline-dark disabled">工事中</button>
                        </div>
                    </div>

                    <div className="row my-5">
                        <div className="col-12 col-md-4">
                            <h2>お問い合わせ</h2>
                            <div>
                                <i className="fas fa-envelope"></i>&nbsp;contact@mail.nilay.jp
                  </div>
                            <div>
                                <i className="fas fa-phone"></i>&nbsp;080-7059-1382
                  </div>
                        </div>
                    </div>

                </div>
            </div>
        );
    }
}

export default HomeView;