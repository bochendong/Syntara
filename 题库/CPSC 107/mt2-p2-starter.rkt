;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname mt2-p2-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@assignment 107/exams/2025w2-mt2/mt2-p2) ;Do not edit or remove this tag

(@cwl ???)   ;fill in your CWL here (same as for problem sets)

(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line

#|

Consider the following data definitions. Refer to mt2-p1-2-figure.pdf
for a graphical representation of S13, which is defined below: 

|#

(@htdd Song ListOfSong Playlist)
(define-struct song (name key album playlist))
(define-struct playlist (name danceability songs))
;; Song is (make-song String String String Playlist)
;; interp. a song with:
;;    name      
;;    key of the song 
;;    name of album
;;    a recommended playlist to check out
;;
;; ListOfSong is one of:
;; - empty
;; - (cons Song ListOfSong)
;; interp. a list of songs
;;
;; Playlist is (make-playlist String Natural ListOfSong)
;; interp. Playlist with:
;;    name
;;    danceability rating [1,100] from least to most
;;    songs in the playlist 
(define P0 (make-playlist "" 0 empty))
(define S0 (make-song "From The Start" "D-flat major" "Bewitched" P0))

(define S1 (make-song "Happily Ever After" "F minor"
                      "The Name Chapter: Freefall" P0))
(define S2 (make-song "September" "A major"
                      "The Best of Earth, Wind & Fire, Vol. 1" P0))
(define P1 (make-playlist "Road Trip!" 70 (list S0 S1 S2)))

(define S3 (make-song "If I Ain't Got You" "G major"
                      "The Diary of Alicia Keys" P0))
(define S4 (make-song "Alley Rose" "G major" "Found Heaven" P0))
(define S5 (make-song "eternal sunshine" "A major" "Eternal Sunshine" P0))
(define S6 (make-song "Calling You Back" "C major" "CINEMA" P0))
(define P4 (make-playlist "People Watching in Cafe" 85
                          (list S3 S4 S5 S6)))

(define S7 (make-song "(They Long to Be) Close to You" "G major"
                      "Close to You" P0))
(define P2 (make-playlist "cozyy" 10 (list S7)))

(define S8 (make-song "A Pearl" "A-flat major" "Be the Cowboy" P0))
(define S9 (make-song "Birds of a feather" "D major" "Hit Me Hard and Soft" P1))
(define S10 (make-song "Heather" "F major" "Kid Krow" P2))

(define P3 (make-playlist "jazz" 25 empty))
(define S11 (make-song "The Thrill Is Gone" "C minor" "Chet Baker Sings" P3))

(define S12 (make-song "Purple Rain" "B-flat major"
                       "Prince and The Revolution - Sixth Studio Album" P4))
(define P5 (make-playlist "Midnight Walks" 90
                          (list S8 S9 S10 S11 S12)))

(define S13 (make-song "Spring Day" "E-flat major" "You Never Walk Alone" P5))

(@template-origin encapsulated Playlist ListOfSong Song)

(define (fn-for-song s0)
  (local [(define (fn-for-song s)
            (... (song-name s)
                 (song-key s)
                 (song-album s)
                 (fn-for-playlist (song-playlist s))))

          (define (fn-for-los los)
            (cond [(empty? los) (...)]
                  [else
                   (... (fn-for-song (first los))
                        (fn-for-los (rest los)))]))

          (define (fn-for-playlist p)
            (... (playlist-name p)
                 (playlist-danceability p)
                 (fn-for-los (playlist-songs p))))]
    
    (fn-for-song s0)))

#|

Given a starting song, you want to browse other songs through recommended
playlists and produce the first song found of a given key or fail if no matching
song can be found. You only want to browse songs if the playlist they are from
has a danceability rating at least as high as the given rating. If not, then
songs from the playlist (and their subsequent recommended playlists) will not
be viewed.

For example,

(song-by-key-and-danceability (make-song "I Bet on Losing Dogs" "A major"
"Puberty 2" P5) "A-flat major" 80)

should produce
 
(make-song "A Pearl" "A-flat major" "Be the Cowboy" P0)

Design a function to help with this search. The function should take a
song, key, and danceability rating (in that order).

We have provided check-expects below. Do not assume those are sufficient
to achieve test thoroughness. 


NOTE: This problem will be autograded, and ALL OF THE FOLLOWING ARE ESSENTIAL
      IN YOUR SOLUTION.  Failure to follow these requirements may result in
      receiving zero marks for this problem.

 - The function you design MUST BE CALLED song-by-key-and-danceability.

 - You MUST NOT edit the provided test, but you should add additional tests.
 
 - You MUST use the encapsulated templates above.
 
 - You MUST NOT RENAME any of the local functions within those templates.
 
 - You MUST NOT RENAME any of the parameters of those local functions.
 
 - You MUST USE ALL of the local functions within those templates.
 
 - You MUST NOT EDIT the data definitions in any way.
 
 - You MUST NOT EDIT the provided @htdf tag, @signature tag, or purpose.
 
 - You MUST NOT COMMENT out any @ metadata tags.
 
 - The file MUST NOT have any errors when the Check Syntax button is pressed.
   Press Check Syntax and Run often, and correct any errors early.
 
 - You MUST FOLLOW all applicable design rules.

|#
(@htdf song-by-key-and-danceability)
(@signature Song String Natural -> Song or false)
;; produce first song of given key from playlist danceability >= given rating
(check-expect (song-by-key-and-danceability S0 "D-flat major" 50) S0) 
(check-expect (song-by-key-and-danceability S13 "F major" 49) S10)
(check-expect (song-by-key-and-danceability S13 "A major" 55) S2)
(check-expect (song-by-key-and-danceability S13 "A-flat major" 91) false)

;; *** MUST NOT EDIT ANY LINE ABOVE HERE except cwl tag ***
                          
(define (song-by-key-and-danceability s0 key drating) false) ;stub