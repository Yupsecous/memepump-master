import { useContext, useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { MdDashboard, MdOutlineHistory, MdOutlineSell } from "react-icons/md";
import { RiProjectorFill, RiExchangeDollarLine } from "react-icons/ri";
import { FaTools, FaRobot, FaChartBar, FaChartLine, FaSuperpowers, FaFireAlt, FaUsers, FaRegCopyright, FaTelegram, FaTwitter, FaBook, FaExchangeAlt } from "react-icons/fa";
import { IoIosArrowDown } from "react-icons/io";
import { BiSolidPurchaseTag, BiTransferAlt } from "react-icons/bi";
import { GrDeploy } from "react-icons/gr";
import { PiSwimmingPool } from "react-icons/pi";
import { MdOutlineToken } from "react-icons/md";

import { AppContext } from "../App";

export default function SideBarComponent({ className }) {
    const { user, currentProject } = useContext(AppContext);
    const navigate = useNavigate();
    const location = useLocation();
    const [openToolsMenu, setOpenToolsMenu] = useState(false);
    const [openProjectMenu, setOpenProjectMenu] = useState(false);
    const [openBotsMenu, setOpenBotsMenu] = useState(false);

    useEffect(() => {
        if (location.pathname === "/create-token" || location.pathname === "/set-authority" || location.pathname === "/openbook" || location.pathname === "/manage-lp" || location.pathname === "/token-account") {
            setOpenToolsMenu(true);
            setOpenProjectMenu(false);
            setOpenBotsMenu(false);
        }
        else if (location.pathname === "/buy" || location.pathname === "/sell" || location.pathname === "/transfer") {
            setOpenProjectMenu(true);
            setOpenToolsMenu(false);
            setOpenBotsMenu(false);
        }
    }, [location.pathname]);

    const handleCollapse = (e, menuName) => {
        e.stopPropagation();
        if (menuName === "tools") {
            const newOpenToolsMenu = !openToolsMenu;
            setOpenToolsMenu(newOpenToolsMenu);
            if (newOpenToolsMenu) {
                setOpenProjectMenu(false);
                setOpenBotsMenu(false);
            }
        }
        else if (menuName === "project") {
            const newOpenProjectMenu = !openProjectMenu;
            setOpenProjectMenu(newOpenProjectMenu);
            if (newOpenProjectMenu) {
                setOpenToolsMenu(false);
                setOpenBotsMenu(false);
            }
        }
        else if (menuName === "bots") {
            const newOpenBotsMenu = !openBotsMenu;
            setOpenBotsMenu(newOpenBotsMenu);
        }
    };

    const handleBuy = () => {
        if (currentProject._id)
            navigate("/buy");
    };

    const handleSell = () => {
        if (currentProject._id)
            navigate("/sell");
    };

    const handleTransfer = () => {
        if (currentProject._id)
            navigate("/transfer");
    };

    return (
        <div className={`${className} font-sans flex-col gap-2 items-center text-gray-normal relative`}>
            <img src={`/logo.png`} className="hidden 2xl:block w-full max-w-[147px] max-h-[35px] mt-5 m-auto cursor-pointer" alt="" onClick={() => navigate("/")} />
            <h1 className="text-white text-center font-bold">SOLANA</h1>
            <div className="absolute w-full bottom-0 p-5 m-auto">
                {/* <img className="flex item-center mb-5 disabled" src="/assets/coin.png" alt="coin" /> */}
                <div className="2xl:flex xl:grid items-center justify-center gap-4">
                    <a href="https://t.me/web3dev93" target="__blank"><FaTelegram className="w-5 h-5 text-white" /></a>
                    <a href="https://twitter.com/memepumpnet" target="__blank"><FaTwitter className="w-5 h-5 text-white" /></a>
                    <a href="https://sniperpad.gitbook.io/memepump" target="__blank"><FaBook className="w-5 h-5 text-white" /></a>
                </div>
            </div>
            
            <div className={`w-[50px] 2xl:w-full h-9 uppercase hover:bg-[rgba(255,255,255,0.1)] flex justify-center text-sm 2xl:justify-start mx-auto 2xl:px-5 gap-4 items-center mt-5 cursor-pointer ${location.pathname === "/dashboard" ? "bg-gray-highlight text-white font-medium" : ""} `} onClick={() => navigate("/dashboard")}>
                <MdDashboard className="w-[18px] h-[18px] relative" />
                <div className="hidden text-sm 2xl:block">
                    Dashboard
                </div>
            </div>
            <div className={`w-[50px] 2xl:w-full h-9 uppercase hover:bg-[rgba(255,255,255,0.1)] flex justify-center text-sm 2xl:justify-start mx-auto 2xl:px-5 gap-4 items-center mt-[1px] cursor-pointer ${(location.pathname === "/buy" || location.pathname === "/sell" || location.pathname === "/transfer" || location.pathname === "/metric") ? "bg-[rgba(255,255,255,0.1)]" : ""}`} onClick={(e) => handleCollapse(e, "project")}>
                <RiProjectorFill className="w-[18px] h-[18px] relative" />
                <div className="items-center justify-between hidden w-[calc(100%-34px)] 2xl:flex">
                    <div className="w-full text-left">
                        Project
                    </div>
                    <IoIosArrowDown className={`w-4 h-full ${openProjectMenu ? "transform rotate-180" : ""}`} />
                </div>
            </div>
            {
                openProjectMenu &&
                <div className="">
                    <div className={`w-[50px] 2xl:w-full h-9 hover:bg-[rgba(255,255,255,0.1)] flex justify-center 2xl:justify-start mx-auto 2xl:pl-7 gap-4 items-center mt-[1px] ${currentProject._id ? "cursor-pointer" : "cursor-not-allowed"} ${location.pathname === "/buy" ? "bg-gray-highlight text-white font-medium" : ""}`} onClick={handleBuy}>
                        <BiSolidPurchaseTag className="w-[18px] h-[18px]" />
                        <div className="hidden text-sm 2xl:flex">
                            Buy
                        </div>
                    </div>
                    <div className={`w-[50px] 2xl:w-full h-9 hover:bg-[rgba(255,255,255,0.1)] flex justify-center 2xl:justify-start mx-auto 2xl:pl-7 gap-4 items-center mt-[1px]  ${currentProject._id ? "cursor-pointer" : "cursor-not-allowed"} ${location.pathname === "/sell" ? "bg-gray-highlight text-white font-medium" : ""}  `} onClick={handleSell}>
                        <MdOutlineSell className="w-[18px] h-[18px]" />
                        <div className="hidden text-sm 2xl:flex">
                            Sell
                        </div>
                    </div>
                    <div className={`w-[50px] 2xl:w-full h-9 hover:bg-[rgba(255,255,255,0.1)] flex justify-center 2xl:justify-start mx-auto 2xl:pl-7 gap-4 items-center mt-[1px] ${currentProject._id ? "cursor-pointer" : "cursor-not-allowed"} ${location.pathname === "/transfer" ? "bg-gray-highlight text-white font-medium" : ""} `} onClick={handleTransfer}>
                        <BiTransferAlt className="w-[18px] h-[18px]" />
                        <div className="hidden text-sm 2xl:flex">
                            Transfer
                        </div>
                    </div>
                </div>
            }
            <div className={`w-[50px] 2xl:w-full h-9 uppercase hover:bg-[rgba(255,255,255,0.1)] flex justify-center text-sm 2xl:justify-start mx-auto 2xl:px-5 gap-4 items-center mt-[1px] cursor-pointer ${(location.pathname === "/create-token" || location.pathname === "/set-authority" || location.pathname === "/openbook" || location.pathname === "/manage-lp" || location.pathname === "/token-account") ? "bg-[rgba(255,255,255,0.1)]" : ""}`} onClick={(e) => handleCollapse(e, "tools")}>
                <FaTools className="w-[18px] h-[18px] relative" />
                <div className="items-center justify-between hidden w-[calc(100%-34px)] 2xl:flex">
                    <div className="w-full text-left">
                        Tools
                    </div>
                    <IoIosArrowDown className={`w-4 h-full ${openToolsMenu ? "transform rotate-180" : ""}`} />
                </div>
            </div>
            {
                openToolsMenu &&
                <div className="">
                    <div className={`w-[50px] 2xl:w-full h-9 hover:bg-[rgba(255,255,255,0.1)] flex justify-center 2xl:justify-start mx-auto 2xl:pl-7 gap-4 items-center mt-[1px] cursor-pointer tracking-tighter ${location.pathname === "/create-token" ? "bg-gray-highlight text-white font-medium" : ""}`} onClick={() => navigate("/create-token")}>
                        <GrDeploy />
                        <div className="hidden text-sm 2xl:flex">
                            Create SPL Token
                        </div>
                    </div>
                </div>
            }
            {
                openToolsMenu &&
                <div className="">
                    <div className={`w-[50px] 2xl:w-full h-9 hover:bg-[rgba(255,255,255,0.1)] flex justify-center 2xl:justify-start mx-auto 2xl:pl-7 gap-4 items-center mt-[1px] cursor-pointer ${location.pathname === "/set-authority" ? "bg-gray-highlight text-white font-medium" : ""}`} onClick={() => navigate("/set-authority")}>
                        <FaRegCopyright className="w-[18px] h-[18px]" />
                        <div className="hidden text-sm 2xl:flex">
                            Set Authority
                        </div>
                    </div>
                </div>
            }
            {
                openToolsMenu &&
                <div className="">
                    <div className={`w-[50px] 2xl:w-full h-9 hover:bg-[rgba(255,255,255,0.1)] flex justify-center 2xl:justify-start mx-auto 2xl:pl-7 gap-4 items-center mt-[1px] cursor-pointer tracking-tighter ${location.pathname === "/openbook" ? "bg-gray-highlight text-white font-medium" : ""}`} onClick={() => navigate("/openbook")}>
                        <RiExchangeDollarLine className="w-[18px] h-[18px]" />
                        <div className="hidden text-sm 2xl:flex">
                            OpenBook Market
                        </div>
                    </div>
                </div>
            }
            {
                openToolsMenu &&
                <div className="">
                    <div className={`w-[50px] 2xl:w-full h-9 hover:bg-[rgba(255,255,255,0.1)] flex justify-center 2xl:justify-start mx-auto 2xl:pl-7 gap-4 items-center mt-[1px] cursor-pointer ${location.pathname === "/manage-lp" ? "bg-gray-highlight text-white font-medium" : ""}`} onClick={() => navigate("/manage-lp")}>
                        <PiSwimmingPool className="w-[18px] h-[18px]" />
                        <div className="hidden text-sm 2xl:flex">
                            Manage LP
                        </div>
                    </div>
                </div>
            }
            {
                openToolsMenu &&
                <div className="">
                    <div className={`w-[50px] 2xl:w-full h-9 hover:bg-[rgba(255,255,255,0.1)] flex justify-center 2xl:justify-start mx-auto 2xl:pl-7 gap-4 items-center mt-[1px] cursor-pointer ${location.pathname === "/token-account" ? "bg-gray-highlight text-white font-medium" : ""}`} onClick={() => navigate("/token-account")}>
                        <MdOutlineToken className="w-[18px] h-[18px]" />
                        <div className="hidden text-sm 2xl:flex">
                            Token Account
                        </div>
                    </div>
                </div>
            }
        
            <div className={`w-[50px] 2xl:w-full h-9 uppercase hover:bg-[rgba(255,255,255,0.1)] flex justify-center text-sm 2xl:justify-start mx-auto 2xl:px-5 gap-4 items-center mt-[1px] cursor-pointer`} onClick={(e) => handleCollapse(e, "bots")}>
                <FaRobot className="w-[18px] h-[18px] relative" />
                <div className="items-center justify-between hidden w-[calc(100%-34px)] 2xl:flex">
                    <div className="w-full text-left">
                        Bots
                    </div>
                    <IoIosArrowDown className={`w-4 h-full ${openBotsMenu ? "transform rotate-180" : ""}`} />
                </div>
            </div>
            {
                openBotsMenu &&
                <div className="">
                    <div className={`w-[50px] 2xl:w-full h-9 hover:bg-[rgba(255,255,255,0.1)] flex justify-center 2xl:justify-start mx-auto 2xl:pl-7 gap-4 items-center mt-[1px] cursor-pointer tracking-tighter`} onClick={() => window.open("https://t.me/MPVolumeMakerSolana_bot", "_blank")}>
                        <FaChartBar />
                        <div className="hidden text-sm 2xl:flex">
                            Volume Bot
                        </div>
                    </div>
                </div>
            }
            {
                openBotsMenu &&
                <div className="">
                    <div className={`w-[50px] 2xl:w-full h-9 hover:bg-[rgba(255,255,255,0.1)] flex justify-center 2xl:justify-start mx-auto 2xl:pl-7 gap-4 items-center mt-[1px] cursor-pointer`} onClick={() => window.open("https://t.me/MPHolderMakerSolana_bot", "_blank")}>
                        <FaUsers className="w-[18px] h-[18px]" />
                        <div className="hidden text-sm 2xl:flex">
                            Maker Bot
                        </div>
                    </div>
                </div>
            }
            {
                openBotsMenu &&
                <div className="">
                    <div className={`w-[50px] 2xl:w-full h-9 hover:bg-[rgba(255,255,255,0.1)] flex justify-center 2xl:justify-start mx-auto 2xl:pl-7 gap-4 items-center mt-[1px] cursor-pointer tracking-tighter`} onClick={() => window.open("https://t.me/MPMarketMakerSolana_bot", "_blank")}>
                        <FaChartLine />
                        <div className="hidden text-sm 2xl:flex">
                            Market Bot
                        </div>
                    </div>
                </div>
            }
        </div>
    );
}
