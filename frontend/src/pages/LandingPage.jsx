import { useNavigate } from "react-router-dom";
import { FaDiscord, FaTelegram, FaTwitter, FaBook } from "react-icons/fa";
import { MdLanguage } from "react-icons/md";
import { IoArrowForward } from "react-icons/io5";

const IMAGE_PATH = process.env.PUBLIC_URL + "/assets/parallax-inner.svg";

export default function LandingPage() {
    const navigate = useNavigate();

    return (
        <div className="text-center bg-gray-dark font-sans min-h-[100vh]">
            <div className="flex flex-col items-center justify-around w-full gap-3 py-10 sm:gap-0 sm:flex-row">
                <img src="/logo.png" className="h-[56px]" alt="logo" />
                <div className="flex items-center gap-4">
                    <a href="https://t.me/web3dev93" target="__blank"><FaTelegram className="w-6 h-6 text-white" /></a>
                    <a href="https://twitter.com/memepumpnet" target="__blank"><FaTwitter className="w-6 h-6 text-white" /></a>
                    <a href="https://sniperpad.gitbook.io/memepump" target="__blank"><FaBook className="w-6 h-6 text-white" /></a>
                </div>
            </div>
            <div className="relative">
                <div className="w-full py-10 px-5">
                    <div className="hidden sm:block py-5 text-center text-white  text-6xl font-semibold font-sans leading-[66px] tracking-wide">
                        Meme Coin Launchpad
                        <br />
                        With Sniping Tool
                    </div>
                    <div className="block sm:hidden py-5 text-center text-white  text-3xl font-semibold font-sans leading-[36px] tracking-wide">
                        Meme Coin Launchpad With Sniping Tool
                    </div>
                    <div className="py-5 text-center text-white text-[16px] sm:text-lg font-normal font-sans leading-[20px] sm:leading-[31.20px]">
                        Dive into the vibrant world of meme coins with MemePump,
                        <br/>the premier launchpad designed exclusively for the Solana ecosystem.
                        <br/>Our platform is the ultimate destination for discovering, 
                        <br/>launching, and sniping the most promising meme coins that are ready to soar.
                    </div>
                    <div className="flex justify-center w-full">
                        <div className="mt-5 text-center text-white text-[16px] sm:text-3xl font-normal font-sans leading-[20px] sm:leading-[31.20px] w-full sm:w-8/12">
                            Why MemePump?
                        </div>
                    </div>
                    <div className="py-5 text-center text-white text-[16px] sm:text-lg font-normal font-sans leading-[20px] sm:leading-[31.20px]">
                    •  Innovative Sniping Tool: Get ahead of the curve with our state-of-the-art sniping tool that allows you to secure your position in the next viral meme coin before the masses.
                    <br/>
                    •  Curated Launches: Each meme coin on our platform is carefully vetted, ensuring that you have access to only the most credible and potential-packed projects.
                    <br/>
                    •  Seamless Integration: Experience smooth transactions and interactions, thanks to our seamless integration with Solana's lightning-fast blockchain.
                    </div>
                    <div className="flex justify-center w-full gap-2">
                        <button
                            className="w-[140px] font-sans text-lg font-medium text-center text-white px-6 h-12 rounded-[20px] justify-center items-center gap-2.5 inline-flex bg-red-normal active:scale-95 transition duration-90 ease-in-out transform focus:outline-none"
                            onClick={() => navigate("/login")}>
                            Login
                        </button>
                        <button
                            className="w-[140px] font-sans text-lg font-medium text-center text-white px-6 h-12 rounded-[20px] justify-center items-center gap-2.5 inline-flex bg-red-normal active:scale-95 transition duration-90 ease-in-out transform focus:outline-none"
                            onClick={() => navigate("/register")}>
                            Register
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
