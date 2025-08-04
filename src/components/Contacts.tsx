import React from "react";
import "../scss/contact.scss";

const Contacts: React.FC = () => {
  return (
    <section className="contact-section">
            <div className="bg-blobs">
                <div className="blob blob-a"></div>
                <div className="blob blob-b"></div>
                <div className="blob blob-c"></div>
            </div>

            <div className="contact-wrapper">
                <h1 className="contact-title">Let’s Connect</h1>

                <div className="cards">
                    {/* Card 1: Info */}
                    <div className="card card-info">
                        <div className="card-graphic" />
                            <h2>Email &amp; Phone</h2>
                        <p>
                            <a href="mailto:mythicalxenon12@gmail.com">mythicalxenon12@gmail.com</a>
                        </p>
                        <p>
                            <a href="tel:+639853047403">+639853047403</a>
                        </p>
                    </div>

                    {/* Card 2: Social */}
                    <div className="card card-social">
                        <div className="card-graphic" />
                        <h2>Find Me On</h2>
                        <div className="social-links">
                            <a href="https://www.linkedin.com/in/julle-myth-vicentillo-5b405021a/">
                                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M16 0C16.5304 0 17.0391 0.210714 17.4142 0.585786C17.7893 0.960859 18 1.46957 18 2V16C18 16.5304 17.7893 17.0391 17.4142 17.4142C17.0391 17.7893 16.5304 18 16 18H2C1.46957 18 0.960859 17.7893 0.585786 17.4142C0.210714 17.0391 0 16.5304 0 16V2C0 1.46957 0.210714 0.960859 0.585786 0.585786C0.960859 0.210714 1.46957 0 2 0H16ZM15.5 15.5V10.2C15.5 9.33539 15.1565 8.5062 14.5452 7.89483C13.9338 7.28346 13.1046 6.94 12.24 6.94C11.39 6.94 10.4 7.46 9.92 8.24V7.13H7.13V15.5H9.92V10.57C9.92 9.8 10.54 9.17 11.31 9.17C11.6813 9.17 12.0374 9.3175 12.2999 9.58005C12.5625 9.8426 12.71 10.1987 12.71 10.57V15.5H15.5ZM3.88 5.56C4.32556 5.56 4.75288 5.383 5.06794 5.06794C5.383 4.75288 5.56 4.32556 5.56 3.88C5.56 2.95 4.81 2.19 3.88 2.19C3.43178 2.19 3.00193 2.36805 2.68499 2.68499C2.36805 3.00193 2.19 3.43178 2.19 3.88C2.19 4.81 2.95 5.56 3.88 5.56ZM5.27 15.5V7.13H2.5V15.5H5.27Z" fill="black"/>
                                </svg>
                            </a>
                            <a href="https://x.com/AshuraXenex">
                                <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M12.9418 9.392L20.5363 0.5H18.7363L12.1438 8.2205L6.87578 0.5H0.800781L8.76578 12.176L0.800781 21.5H2.60078L9.56378 13.346L15.1273 21.5H21.2023L12.9418 9.392ZM10.4773 12.278L9.67028 11.1155L3.24878 1.865H6.01328L11.1943 9.3305L12.0013 10.493L18.7378 20.198H15.9733L10.4773 12.278Z" fill="black"/>
                                </svg>
                            </a>
                            <a href="https://github.com/Jullemyth122">
                                <svg width="21" height="20" viewBox="0 0 21 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M10.0273 0C8.71413 0 7.41376 0.258658 6.20051 0.761205C4.98725 1.26375 3.88486 2.00035 2.95628 2.92893C1.08091 4.8043 0.0273438 7.34784 0.0273438 10C0.0273438 14.42 2.89734 18.17 6.86734 19.5C7.36734 19.58 7.52734 19.27 7.52734 19V17.31C4.75734 17.91 4.16734 15.97 4.16734 15.97C3.70734 14.81 3.05734 14.5 3.05734 14.5C2.14734 13.88 3.12734 13.9 3.12734 13.9C4.12734 13.97 4.65734 14.93 4.65734 14.93C5.52734 16.45 6.99734 16 7.56734 15.76C7.65734 15.11 7.91734 14.67 8.19734 14.42C5.97734 14.17 3.64734 13.31 3.64734 9.5C3.64734 8.39 4.02734 7.5 4.67734 6.79C4.57734 6.54 4.22734 5.5 4.77734 4.15C4.77734 4.15 5.61734 3.88 7.52734 5.17C8.31734 4.95 9.17734 4.84 10.0273 4.84C10.8773 4.84 11.7373 4.95 12.5273 5.17C14.4373 3.88 15.2773 4.15 15.2773 4.15C15.8273 5.5 15.4773 6.54 15.3773 6.79C16.0273 7.5 16.4073 8.39 16.4073 9.5C16.4073 13.32 14.0673 14.16 11.8373 14.41C12.1973 14.72 12.5273 15.33 12.5273 16.26V19C12.5273 19.27 12.6873 19.59 13.1973 19.5C17.1673 18.16 20.0273 14.42 20.0273 10C20.0273 8.68678 19.7687 7.38642 19.2661 6.17317C18.7636 4.95991 18.027 3.85752 17.0984 2.92893C16.1698 2.00035 15.0674 1.26375 13.8542 0.761205C12.6409 0.258658 11.3406 0 10.0273 0Z" fill="black"/>
                                </svg>
                            </a>
                        </div>
                    </div>

                    {/* Card 3: Form */}
                    <div className="card card-form">
                        <div className="card-graphic" />
                        <h2>Send A Message</h2>
                        <form>
                            <div className="field">
                                <input type="text" placeholder="Name" required />
                            </div>
                            <div className="field">
                                <input type="email" placeholder="Email" required />
                            </div>
                            <div className="field">
                                <textarea rows={4} placeholder="Your message…" required />
                            </div>
                            <button type="submit">Submit</button>
                        </form>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default Contacts;
