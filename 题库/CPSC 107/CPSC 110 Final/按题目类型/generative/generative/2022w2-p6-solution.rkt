;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p6-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #t #t none #f () #f)))
(require spd/tags)

(@assignment exams/2022w2-f/f-p6)




(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line
(@problem 4) ;do not edit or delete this line
(@problem 5) ;do not edit or delete this line
(@problem 6) ;do not edit or delete this line



(@htdd Node)
(define-struct node (name nexts))
;; Node is (make-node String (listof String))
;; interp. Nodes in a very simple graph.  Each node has a name and a list
;;         of the nodes to which it is connected.  The node names in nexts
;;         act as 'arrows' in the graph that point from the current node
;;         to next nodes.


(@htdd Map)
;; Map is ???
;; interp. an opaque data type that represents a map from node names to nodes.
;;         Only the provided function get-node knows how to work with a map.
;;
;; CONSTRAINT: A given map has no duplicate node names.
;;
;; We are giving you one map to work with called MAP, and the attached file
;; f-p6-figure.pdf includes a diagram of the graph represented by that map.
;; Do not assume that we will only test your function with that map.



;;
;; Here is a STRUCTURALLY RECURSIVE template for working with a graph of these
;; nodes.  Note that this template DOES NOT INCLUDE cycle detection. You will
;; have to add that.
;;
(define (fn-for-graph start-node-name map)  
  (local [(define (fn-for-node n prev path)
            (... (node-name n)
                 (fn-for-lonn (node-nexts n))))

          (define (fn-for-lonn lonn)
            (cond [(empty? lonn) (...)]
                  [else
                   (... (fn-for-node-name (first lonn))
                        (fn-for-lonn (rest lonn)))]))

          (define (fn-for-node-name nn)
            (fn-for-node (get-node nn map)))]  ;this is a generative step

    (fn-for-node-name start-node-name)))



(@htdf find-path)


;; **** V1 - produces Boolean ****
#|
(@signature String String Map -> Boolean or false)

(check-expect (find-path "F" "F" MAP) true)
(check-expect (find-path "A" "X" MAP) false)
(check-expect (find-path "A" "B" MAP) true)
(check-expect (find-path "A" "C" MAP) true)
(check-expect (find-path "A" "D" MAP) true)
(check-expect (find-path "A" "E" MAP) true)
(check-expect (find-path "A" "F" MAP) true)
(check-expect (find-path "A" "G" MAP) true)

(@template-origin genrec Node (listof String) String accumulator try-catch)

(define (find-path start end map)
  ;; path 
  (local [(define (fn-for-node n path)
            (cond [(member (node-name n) path) false]
                  [(string=?  (node-name n) end) true]
                  [else
                   (fn-for-lonn (node-nexts n)
                                (cons (node-name n) path))]))

          (define (fn-for-lonn lonn path)
            (cond [(empty? lonn) false]
                  [else
                   (local [(define try
                             (fn-for-node-name (first lonn) path))]
                     (if (not (false? try))
                         try
                         (fn-for-lonn (rest lonn) path)))]))

          (define (fn-for-node-name nn path)
            (fn-for-node (get-node nn map) path))]

    (fn-for-node-name start empty)))


;; **** V2 - produces first path (unordered) ****

(@signature String String Map -> (listof String) or false)

(check-expect (find-path "F" "F" MAP) (list "F"))
(check-expect (find-path "A" "X" MAP) false)
(check-expect (find-path "A" "B" MAP) (list "A" "B"))
(check-expect (find-path "A" "C" MAP) (list "A" "B" "C"))
(check-expect (find-path "A" "D" MAP) (list "A" "B" "C" "E" "D"))
(check-expect (find-path "A" "E" MAP) (list "A" "B" "C" "E"))
(check-expect (find-path "A" "F" MAP) (list "A" "B" "C" "E" "D" "F"))
(check-expect (find-path "A" "G" MAP) (list "A" "B" "C" "E" "D" "G"))


(@template-origin genrec Node (listof String) String accumulator try-catch)

(define (find-path start end map)
  ;; path 
  (local [(define (fn-for-node n path)
            (cond [(member (node-name n) path) false]
                  [(string=?  (node-name n) end)
                   (reverse (cons (node-name n) path))]
                  [else
                   (fn-for-lonn (node-nexts n)
                                (cons (node-name n) path))]))

          (define (fn-for-lonn lonn path)
            (cond [(empty? lonn) false]
                  [else
                   (local [(define try
                             (fn-for-node-name (first lonn) path))]
                     (if (not (false? try))
                         try
                         (fn-for-lonn (rest lonn) path)))]))

          (define (fn-for-node-name nn path)
            (fn-for-node (get-node nn map) path))]

    (fn-for-node-name start empty)))


;; **** V3 - produces ordered path ****

(@signature String String Map -> (listof String) or false)

(check-expect (find-path "F" "F" MAP) (list "F"))
(check-expect (find-path "A" "X" MAP) false)
(check-expect (find-path "A" "B" MAP) (list "A" "B"))
(check-expect (find-path "A" "C" MAP) (list "A" "B" "C"))
(check-expect (find-path "A" "D" MAP) (list "A" "B" "C" "D"))
(check-expect (find-path "A" "E" MAP) (list "A" "B" "C" "E"))
(check-expect (find-path "A" "F" MAP) (list "A" "B" "C" "D" "F"))
(check-expect (find-path "A" "G" MAP) (list "A" "B" "C" "D" "G"))

(@template-origin genrec Node (listof String) String accumulator try-catch)

(define (find-path start end map)
  ;; path 
  (local [(define (fn-for-node n path)
            (cond [(member (node-name n) path) false]
                  [(and (not (empty? path))
                        (not (string>? (node-name n) (first path))))
                   false]
                  [(string=?  (node-name n) end)
                   (reverse (cons (node-name n) path))]
                  [else
                   (fn-for-lonn (node-nexts n)
                                (cons (node-name n) path))]))

          (define (fn-for-lonn lonn path)
            (cond [(empty? lonn) false]
                  [else
                   (local [(define try
                             (fn-for-node-name (first lonn) path))]
                     (if (not (false? try))
                         try
                         (fn-for-lonn (rest lonn) path)))]))

          (define (fn-for-node-name nn path)
            (fn-for-node (get-node nn map) path))]

    (fn-for-node-name start empty)))

|#

;; **** V4 - produces ordered path and is tail recursive ****

(@signature String String Map -> (listof String) or false)

(check-expect (find-path "F" "F" MAP) (list "F"))
(check-expect (find-path "A" "X" MAP) false)
(check-expect (find-path "A" "B" MAP) (list "A" "B"))
(check-expect (find-path "A" "C" MAP) (list "A" "B" "C"))
(check-expect (find-path "A" "D" MAP) (list "A" "B" "C" "D"))
(check-expect (find-path "A" "E" MAP) (list "A" "B" "C" "E"))
(check-expect (find-path "A" "F" MAP) (list "A" "B" "C" "D" "F"))
(check-expect (find-path "A" "G" MAP) (list "A" "B" "C" "D" "G"))

(@template-origin genrec Node (listof String) String accumulator)

(define (find-path start end map)
  ;; nn-wl
  ;; path-wl
  (local [(define (fn-for-node n path nn-wl path-wl)
            (cond [(or (member (node-name n) path)
                       (and (not (empty? path))
                            (not (string>? (node-name n) (first path)))))
                   (fn-for-lonn nn-wl path-wl)]
                  [(string=?  (node-name n) end)
                   (reverse (cons (node-name n) path))]
                  [else
                   (local [(define len (length (node-nexts n)))
                           (define name (node-name n))
                           (define npath (cons name path))]
                     (fn-for-lonn (append (node-nexts n)        nn-wl)
                                  (append (make-list len npath) path-wl)))]))

          (define (fn-for-lonn nn-wl path-wl)
            (cond [(empty? nn-wl) false]
                  [else
                   (fn-for-node-name (first nn-wl)
                                     (first path-wl)
                                     (rest nn-wl)
                                     (rest path-wl))]))

          (define (fn-for-node-name nn path nn-wl path-wl)
            (fn-for-node (get-node nn map) path nn-wl path-wl))]

    (fn-for-node-name start empty empty empty)))


;;
;; Consider this to be a primitive function that comes with the data definitions
;; and that given a node name it produces the corresponding node.  Because this
;; consumes a string and generates a node calling it will amount to a generative
;; step in a recursion through a map of nodes.
;;
(@htdf get-node)
(@signature String -> Node)

(define (get-node name map)
  (local [(define (scan lon)
            (cond [(empty? lon) (error "No node named " name)]
                  [else
                   (if (string=? (node-name (first lon)) name)
                       (first lon)
                       (scan (rest lon)))]))]
    (scan map)))




(define MAP
  (list (make-node "A" (list "B"))
        (make-node "B" (list "A" "C"))
        (make-node "C" (list "E" "D"))
        (make-node "D" (list "E" "F" "G"))
        (make-node "E" (list "D"))
        (make-node "F" (list))
        (make-node "G" (list "F"))))
