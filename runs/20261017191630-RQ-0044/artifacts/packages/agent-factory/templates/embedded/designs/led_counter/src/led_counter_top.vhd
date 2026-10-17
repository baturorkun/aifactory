-- The eight LEDs show the top bits of a counter running on the 100 MHz clock,
-- so they visibly count (LD0 toggles about every 0.17 s).
library ieee;
use ieee.std_logic_1164.all;

entity led_counter_top is
    port (
        gclk : in  std_logic;
        led  : out std_logic_vector(7 downto 0)
    );
end entity;

architecture rtl of led_counter_top is
    signal count : std_logic_vector(31 downto 0);
begin
    u_counter : entity work.counter
        generic map (G_WIDTH => 32)
        port map (clk => gclk, rst => '0', en => '1', count => count);

    led <= count(31 downto 24);
end architecture;
