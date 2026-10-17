-- A free-running binary counter with a synchronous, active-high reset and an
-- enable. The width is a generic, so the same core serves any target.
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity counter is
    generic (
        G_WIDTH : positive := 32
    );
    port (
        clk   : in  std_logic;
        rst   : in  std_logic;
        en    : in  std_logic;
        count : out std_logic_vector(G_WIDTH - 1 downto 0)
    );
end entity;

architecture rtl of counter is
    signal value : unsigned(G_WIDTH - 1 downto 0) := (others => '0');
begin
    process(clk)
    begin
        if rising_edge(clk) then
            if rst = '1' then
                value <= (others => '0');
            elsif en = '1' then
                value <= value + 1;
            end if;
        end if;
    end process;

    count <= std_logic_vector(value);
end architecture;
